import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, lt, notLike, sql } from "drizzle-orm";
import { MAX_DOCUMENT_BYTES } from "@/features/intake/entry-schema";
import { toCriterion } from "@/features/screening/criteria";
import { type Criterion, type Verdict } from "@/features/screening/domain";
import { stateForVerdict } from "@/features/screening/state";
import { AiOutputError } from "@/server/ai/client";
import { READ_PROMPT_VERSION, readDocument } from "@/server/ai/read-document";
import { SCREEN_PROMPT_VERSION } from "@/server/ai/screen";
import { getAdminDb } from "@/server/db/admin";
import {
  applicationAnswers,
  applications,
  candidates,
  documents,
  screeningCriteria,
  screeningDecisions,
  screeningRuns,
  screeningSettings,
} from "@/server/db/schema";
import { inviteAfterPass } from "@/features/ai-interview/server";
import { recordEvent } from "@/server/events";
import { sniffFileType } from "@/server/files";
import { downloadObject, removeObjects } from "@/server/storage";
import { judgeApplication, readPdf } from "./judge";

// The screening pipeline (docs/02 M4, docs/05 §6): verify uploads → read each document → screen.
// Each function is one Inngest step and returns IDs and verdict codes only, never personal data,
// because step results are stored by Inngest.

const MAX_PDF_PAGES = 20;

type DocumentMime = "application/pdf" | "image/jpeg" | "image/png";

/**
 * Checks every uploaded-but-unverified document of an application by its bytes: it must exist,
 * be a PDF, JPEG or PNG within the size limit, and a PDF must open and have at most 20 pages.
 */
export async function verifyDocuments(applicationId: string, orgId: string): Promise<void> {
  const db = getAdminDb();
  const pending = await db
    .select({ id: documents.id, path: documents.storagePath })
    .from(documents)
    .where(
      and(
        eq(documents.applicationId, applicationId),
        eq(documents.orgId, orgId),
        eq(documents.status, "uploading"),
      ),
    );

  for (const doc of pending) {
    const data = await downloadObject("documents", doc.path).catch(() => null);
    let problem: string | null = null;
    let pages = 1;
    const mime = data ? sniffFileType(data) : null;
    if (!data) problem = "missing";
    else if (data.length > MAX_DOCUMENT_BYTES) problem = "too_large";
    else if (!mime) problem = "unsupported_type";
    else if (mime === "application/pdf") {
      const pdf = await readPdf(data);
      if (!pdf) problem = "unreadable_pdf";
      else if (pdf.pages > MAX_PDF_PAGES) problem = "too_many_pages";
      else pages = pdf.pages;
    }

    if (problem || !data || !mime) {
      await db
        .update(documents)
        .set({ status: "rejected", readStatus: "skipped", readError: problem })
        .where(eq(documents.id, doc.id));
      if (data) await removeObjects("documents", [doc.path]);
      continue;
    }
    await db
      .update(documents)
      .set({
        status: "ready",
        mime,
        bytes: data.length,
        pages,
        sha256: createHash("sha256").update(data).digest("hex"),
      })
      .where(eq(documents.id, doc.id));
  }
}

/** Ready documents that still need reading (all of them when `reread` is set). */
export async function documentsToRead(
  applicationId: string,
  orgId: string,
  reread: boolean,
): Promise<string[]> {
  const rows = await getAdminDb()
    .select({ id: documents.id, readStatus: documents.readStatus })
    .from(documents)
    .where(
      and(
        eq(documents.applicationId, applicationId),
        eq(documents.orgId, orgId),
        eq(documents.status, "ready"),
      ),
    )
    .orderBy(asc(documents.createdAt));
  return rows.filter((d) => reread || d.readStatus === "pending").map((d) => d.id);
}

/**
 * Reads one document: the PDF text layer when it has one, otherwise the AI transcription. An
 * unusable AI answer marks the document failed (screening then sends it to a person); other errors
 * are thrown for Inngest to retry, except on the last attempt.
 */
export async function readOne(
  documentId: string,
  orgId: string,
  lastAttempt: boolean,
): Promise<"done" | "failed" | "skipped"> {
  const db = getAdminDb();
  const [doc] = await db
    .select({ path: documents.storagePath, mime: documents.mime, status: documents.status })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.orgId, orgId)));
  if (!doc || doc.status !== "ready") return "skipped";

  try {
    const data = await downloadObject("documents", doc.path);
    const mime = (doc.mime ?? sniffFileType(data)) as DocumentMime;
    const pdfText = mime === "application/pdf" ? ((await readPdf(data))?.text ?? null) : null;
    const result = await readDocument({ orgId, data, mime, pdfText });
    await db
      .update(documents)
      .set({
        readStatus: "done",
        readError: null,
        transcript: result.transcript,
        textSource: result.textSource,
        legibility: result.legibility,
        injectionSuspected: result.injection,
        profile: result.profile,
        readModel: result.model,
        readPromptVersion: READ_PROMPT_VERSION,
      })
      .where(eq(documents.id, documentId));
    return "done";
  } catch (error) {
    if (!(error instanceof AiOutputError) && !lastAttempt) throw error;
    await db
      .update(documents)
      .set({
        readStatus: "failed",
        readError: error instanceof AiOutputError ? error.reason : "error",
      })
      .where(eq(documents.id, documentId));
    return "failed";
  }
}

export type ScreenOutcome =
  | {
      verdict: Verdict;
      score: number | null;
      invitationId: string | null;
      aiSessionId: string | null;
    }
  | { skipped: "notFound" | "closed" | "manual" | "advanced" };

/**
 * Screens one application with its job's current criteria and stores the run, the decision and
 * the new state. Manual decisions are never overwritten (docs/02 M4-7).
 */
export async function screenApplication(
  applicationId: string,
  orgId: string,
  lastAttempt: boolean,
): Promise<ScreenOutcome> {
  const db = getAdminDb();
  const [app] = await db
    .select({
      clientId: applications.clientId,
      jobId: applications.jobId,
      stage: applications.stage,
      outcome: applications.outcome,
      verdict: applications.verdict,
      currentRound: applications.currentRound,
      candidateName: candidates.name,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
  if (!app) return { skipped: "notFound" };
  if (app.outcome !== "active") return { skipped: "closed" };
  if (app.verdict.startsWith("manual_")) return { skipped: "manual" };
  if (app.stage !== "applied" && app.stage !== "screening") return { skipped: "advanced" };

  const [[settingsRow], criteriaRows, answerRows, docs] = await Promise.all([
    db.select().from(screeningSettings).where(eq(screeningSettings.jobId, app.jobId)),
    db
      .select()
      .from(screeningCriteria)
      .where(eq(screeningCriteria.jobId, app.jobId))
      .orderBy(asc(screeningCriteria.position)),
    db
      .select({ key: applicationAnswers.key, value: applicationAnswers.value })
      .from(applicationAnswers)
      .where(eq(applicationAnswers.applicationId, applicationId)),
    db
      .select({
        kind: documents.kind,
        readStatus: documents.readStatus,
        readError: documents.readError,
        transcript: documents.transcript,
        legibility: documents.legibility,
        injectionSuspected: documents.injectionSuspected,
      })
      .from(documents)
      .where(and(eq(documents.applicationId, applicationId), eq(documents.status, "ready")))
      .orderBy(asc(documents.createdAt)),
  ]);

  const settings = {
    passLine: settingsRow?.passLine ?? 70,
    failLine: settingsRow?.failLine ?? 40,
    autoJudge: settingsRow?.autoJudge ?? true,
    confirmRejections: settingsRow?.confirmRejections ?? true,
    weightMode: settingsRow?.weightMode ?? "equal",
  };
  const criteria = criteriaRows.map(toCriterion).filter((c): c is Criterion => c !== null);
  const answers: Record<string, string | string[] | number> = {};
  for (const row of answerRows) {
    const key = row.key.startsWith("criterion:") ? row.key.slice("criterion:".length) : row.key;
    answers[key] = row.value as string | string[] | number;
  }

  const { decision, model } = await judgeApplication(
    { orgId, candidateName: app.candidateName, criteria, settings, answers, docs },
    lastAttempt,
  );
  const state = stateForVerdict(decision.verdict);

  const invited = await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(screeningRuns)
      .values({
        orgId,
        clientId: app.clientId,
        applicationId,
        criteriaVersion: settingsRow?.criteriaVersion ?? 1,
        model,
        promptVersion: SCREEN_PROMPT_VERSION,
        score: decision.score,
        verdictAi: decision.verdict,
        results: decision.outcomes,
        flags: decision.flags,
        reasons: decision.reasons,
      })
      .returning({ id: screeningRuns.id });
    // Checked again here: a person may have decided while the AI was working.
    const updated = await tx
      .update(applications)
      .set({ verdict: decision.verdict, score: decision.score, ...state })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.outcome, "active"),
          notLike(sql`${applications.verdict}::text`, "manual_%"),
        ),
      )
      .returning({ id: applications.id });
    if (updated.length === 0) return null;
    await tx.insert(screeningDecisions).values({
      orgId,
      clientId: app.clientId,
      applicationId,
      verdict: decision.verdict,
      source: "ai",
    });
    await recordEvent(tx, {
      orgId,
      clientId: app.clientId,
      applicationId,
      actor: "system",
      type: "screening.completed",
      payload: {
        runId: run!.id,
        verdict: decision.verdict,
        score: decision.score,
        reasons: decision.reasons,
      },
    });
    if (decision.verdict !== "pass") return null;
    // The job's AI interview where it has one, otherwise booking with a person (M7-1, M12-1).
    return inviteAfterPass(tx, {
      orgId,
      clientId: app.clientId,
      applicationId,
      round: app.currentRound,
      actor: "system",
    });
  });
  return {
    verdict: decision.verdict,
    score: decision.score,
    invitationId: invited?.invitationId ?? null,
    aiSessionId: invited?.aiSessionId ?? null,
  };
}

/** After processing gave up: leave the application with a person instead of stuck in "pending". */
export async function markProcessingFailed(
  applicationId: string,
  orgId: string,
  reason: "error" | "quota" = "error",
): Promise<void> {
  const db = getAdminDb();
  await db.transaction(async (tx) => {
    const [app] = await tx
      .update(applications)
      .set({
        verdict: "check",
        stage: "screening",
        waitingOn: "staff",
        nextAction: "review_screening",
      })
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.orgId, orgId),
          eq(applications.verdict, "pending"),
        ),
      )
      .returning({ clientId: applications.clientId });
    if (!app) return;
    await recordEvent(tx, {
      orgId,
      clientId: app.clientId,
      applicationId,
      actor: "system",
      type: "screening.failed",
      payload: { reason },
    });
  });
}

/** Applications handed to the pipeline whose event seems lost (docs/05 §7: the outbox sweep). */
export async function findStuckApplications(): Promise<{ applicationId: string; orgId: string }[]> {
  return getAdminDb()
    .select({ applicationId: applications.id, orgId: applications.orgId })
    .from(applications)
    .where(
      and(
        eq(applications.waitingOn, "system"),
        eq(applications.verdict, "pending"),
        eq(applications.outcome, "active"),
        lt(applications.updatedAt, sql`now() - interval '10 minutes'`),
      ),
    )
    .limit(100);
}

/** Open applications of a job to re-screen after its criteria changed (docs/02 M4-8). */
export async function applicationsToRescreen(jobId: string, orgId: string): Promise<string[]> {
  const rows = await getAdminDb()
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.jobId, jobId),
        eq(applications.orgId, orgId),
        eq(applications.outcome, "active"),
        inArray(applications.stage, ["applied", "screening"]),
        notLike(sql`${applications.verdict}::text`, "manual_%"),
      ),
    );
  return rows.map((r) => r.id);
}
