"use server";

import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { aiQuotaReached } from "@/features/billing/limits";
import { applyStageChange, type PreviousState } from "@/features/candidates/stage-change";
import { postingFieldsSchema } from "@/features/jobs/schema";
import type { CriterionOutcome } from "@/features/screening/domain";
import { maskForScreening } from "@/features/screening/text";
import { canEdit, type MemberCtx, requireEditor, requireMember } from "@/server/auth/session";
import { suggestQuestions } from "@/server/ai/interview-questions";
import { encryptPii } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import type { Tx } from "@/server/db/client";
import { withRls } from "@/server/db/rls";
import {
  applications,
  candidates,
  documents,
  interviewDecisions,
  interviewEvaluations,
  interviewInvitations,
  interviewQuestions,
  interviewReports,
  interviews,
  interviewTranscripts,
  jobs,
  memberships,
  screeningRuns,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { decisionMade, interviewChanged, reportRequested } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { parseTranscript, RUBRIC_IDS, SCORE_MAX, SCORE_MIN } from "./rubric";

/** How long a decision can be taken back before its emails go out (docs/02 M11-4). */
const UNDO_MINUTES = 10;
const MAX_TRANSCRIPT_CHARS = 300_000;
const MAX_SEGMENTS = 4000;

const page = (ctx: MemberCtx, interviewId: string) =>
  `/app/${ctx.orgSlug}/${ctx.clientSlug}/meetings/${interviewId}`;

/**
 * The interview, if the member may work on it: editors of the client, or one of its interviewers
 * (docs/02 M1-4). RLS enforces the same on every write.
 */
async function workOn(orgSlug: string, clientSlug: string, interviewId: string) {
  const ctx = await requireMember(orgSlug, clientSlug);
  const id = z.uuid().parse(interviewId);
  const [interview] = await withRls(ctx, (tx) =>
    tx
      .select({
        id: interviews.id,
        applicationId: interviews.applicationId,
        round: interviews.round,
        status: interviews.status,
        startsAt: interviews.startsAt,
        interviewerIds: interviews.interviewerIds,
        purpose: interviews.purpose,
        recordingAllowed: interviews.recordingAllowed,
      })
      .from(interviews)
      .where(
        and(
          eq(interviews.id, id),
          eq(interviews.orgId, ctx.orgId),
          eq(interviews.clientId, ctx.clientId),
        ),
      ),
  );
  if (!interview) throw new Error("Interview not found.");
  if (!canEdit(ctx) && !interview.interviewerIds.includes(ctx.userId)) {
    throw new Error("Only the client's editors and this interview's interviewers can do that.");
  }
  const scope = {
    orgId: ctx.orgId,
    clientId: ctx.clientId,
    applicationId: interview.applicationId,
  };
  return { ctx, interview, scope };
}

/** Who runs the interview (docs/02 M1-4); editors only. */
export async function assignInterviewersAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  userIds: string[],
): Promise<{ ok: boolean }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const id = z.uuid().parse(interviewId);
  const wanted = z.array(z.uuid()).max(10).parse(userIds);
  const ok = await withRls(ctx, async (tx) => {
    const valid = wanted.length
      ? await tx
          .select({ id: memberships.userId })
          .from(memberships)
          .where(
            and(
              eq(memberships.orgId, ctx.orgId),
              eq(memberships.status, "active"),
              ne(memberships.role, "viewer"),
              inArray(memberships.userId, wanted),
            ),
          )
      : [];
    const ids = valid.map((v) => v.id);
    const [updated] = await tx
      .update(interviews)
      .set({ interviewerIds: ids })
      .where(
        and(
          eq(interviews.id, id),
          eq(interviews.orgId, ctx.orgId),
          eq(interviews.clientId, ctx.clientId),
        ),
      )
      .returning({ applicationId: interviews.applicationId });
    if (!updated) return false;
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId: updated.applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: "interview.assigned",
      payload: { interviewId: id, interviewerIds: ids },
    });
    return true;
  });
  revalidatePath(page(ctx, id));
  return { ok };
}

/** What this round should find out (docs/02 M11-2). */
export async function savePurposeAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  purpose: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const id = z.uuid().parse(interviewId);
  const value = z.string().trim().max(1000).parse(purpose);
  await withRls(ctx, (tx) =>
    tx
      .update(interviews)
      .set({ purpose: value || null })
      .where(
        and(
          eq(interviews.id, id),
          eq(interviews.orgId, ctx.orgId),
          eq(interviews.clientId, ctx.clientId),
        ),
      ),
  );
  revalidatePath(page(ctx, id));
  return { ok: true };
}

export type QuestionsResult = { ok: true } | { ok: false; error: "quota" | "ai" };

/**
 * AI question suggestions from the documents, the screening results and the round's purpose
 * (docs/02 M11-2). The interviewer's own questions are kept; earlier suggestions are replaced.
 */
export async function generateQuestionsAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  mode: "standard" | "deep",
): Promise<QuestionsResult> {
  const { ctx, interview, scope } = await workOn(orgSlug, clientSlug, interviewId);
  const parsedMode = z.enum(["standard", "deep"]).parse(mode);
  if (await aiQuotaReached(getAdminDb(), ctx.orgId, new Date()))
    return { ok: false, error: "quota" };

  const context = await withRls(ctx, async (tx) => {
    const [app] = await tx
      .select({ name: candidates.name, postingFields: jobs.postingFields, title: jobs.title })
      .from(applications)
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(applications.id, scope.applicationId));
    const docs = await tx
      .select({ transcript: documents.transcript })
      .from(documents)
      .where(
        and(eq(documents.applicationId, scope.applicationId), ne(documents.status, "rejected")),
      );
    const [run] = await tx
      .select({ results: screeningRuns.results })
      .from(screeningRuns)
      .where(eq(screeningRuns.applicationId, scope.applicationId))
      .orderBy(sql`${screeningRuns.createdAt} desc`)
      .limit(1);
    const [existing] = await tx
      .select({ items: interviewQuestions.items })
      .from(interviewQuestions)
      .where(eq(interviewQuestions.interviewId, interview.id));
    return { app, docs, run, existing };
  });
  if (!context.app) return { ok: false, error: "ai" };
  const fields = postingFieldsSchema.catch({}).parse(context.app.postingFields);
  const names = [context.app.name];

  let suggestion: Awaited<ReturnType<typeof suggestQuestions>>;
  try {
    suggestion = await suggestQuestions({
      orgId: ctx.orgId,
      mode: parsedMode,
      job: {
        title: fields.title ?? context.app.title,
        description: fields.description ?? "",
        requirements: fields.mustHave ?? "",
      },
      round: interview.round,
      purpose: interview.purpose,
      screening: ((context.run?.results ?? []) as CriterionOutcome[]).map((o) => ({
        label: o.label,
        result: o.type === "basic" ? String(o.met ?? "不明") : (o.match ?? "not_stated"),
        evidence: o.evidenceVerified === false ? null : o.evidence,
      })),
      maskedDocuments: context.docs
        .map((d) => maskForScreening(d.transcript ?? "", names))
        .filter(Boolean)
        .join("\n\n---\n\n"),
    });
  } catch {
    return { ok: false, error: "ai" };
  }

  const own = (context.existing?.items ?? []).filter((q) => q.group === "own");
  const items = [
    ...suggestion.questions.map((q) => ({ id: randomUUID(), ...q, picked: true })),
    ...own,
  ];
  await withRls(ctx, (tx) =>
    tx
      .insert(interviewQuestions)
      .values({
        interviewId: interview.id,
        ...scope,
        mode: parsedMode,
        items,
        model: suggestion.model,
        updatedBy: ctx.userId,
      })
      .onConflictDoUpdate({
        target: interviewQuestions.interviewId,
        set: { mode: parsedMode, items, model: suggestion.model, updatedBy: ctx.userId },
      }),
  );
  revalidatePath(page(ctx, interview.id));
  return { ok: true };
}

const questionSchema = z.object({
  id: z.string().min(1).max(64),
  group: z.enum(["experience", "consistency", "motivation", "own"]),
  text: z.string().trim().min(1).max(300),
  why: z.string().trim().max(300),
  picked: z.boolean(),
});

/** The interviewer's picks, order, edits and own questions. */
export async function saveQuestionsAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  items: z.input<typeof questionSchema>[],
): Promise<{ ok: boolean }> {
  const { ctx, interview, scope } = await workOn(orgSlug, clientSlug, interviewId);
  const parsed = z.array(questionSchema).max(60).safeParse(items);
  if (!parsed.success) return { ok: false };
  await withRls(ctx, (tx) =>
    tx
      .insert(interviewQuestions)
      .values({ interviewId: interview.id, ...scope, items: parsed.data, updatedBy: ctx.userId })
      .onConflictDoUpdate({
        target: interviewQuestions.interviewId,
        set: { items: parsed.data, updatedBy: ctx.userId },
      }),
  );
  revalidatePath(page(ctx, interview.id));
  return { ok: true };
}

const score = z.number().int().min(SCORE_MIN).max(SCORE_MAX);
const evaluationSchema = z.object({
  scores: z.partialRecord(z.enum(RUBRIC_IDS as [string, ...string[]]), score),
  comments: z.partialRecord(
    z.enum(RUBRIC_IDS as [string, ...string[]]),
    z.string().trim().max(1000),
  ),
  notes: z.string().trim().max(5000),
  recommendation: z.enum(["advance", "hold", "decline"]).nullable(),
});

/** One interviewer's ratings and notes (docs/02 M11-3); each person keeps their own. */
export async function saveEvaluationAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  input: z.input<typeof evaluationSchema>,
): Promise<{ ok: boolean }> {
  const { ctx, interview, scope } = await workOn(orgSlug, clientSlug, interviewId);
  const parsed = evaluationSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const values = {
    scores: parsed.data.scores as Record<string, number>,
    comments: Object.fromEntries(
      Object.entries(parsed.data.comments).filter(([, v]) => v),
    ) as Record<string, string>,
    notes: parsed.data.notes || null,
    recommendation: parsed.data.recommendation,
  };
  await withRls(ctx, async (tx) => {
    const [row] = await tx
      .insert(interviewEvaluations)
      .values({ ...scope, interviewId: interview.id, authorId: ctx.userId, ...values })
      .onConflictDoUpdate({
        target: [interviewEvaluations.interviewId, interviewEvaluations.authorId],
        set: values,
      })
      .returning({ created: sql<boolean>`(xmax = 0)` });
    if (row?.created) {
      await recordEvent(tx, {
        ...scope,
        actor: "staff",
        actorId: ctx.userId,
        type: "interview.evaluated",
        payload: { interviewId: interview.id },
      });
    }
  });
  revalidatePath(page(ctx, interview.id));
  return { ok: true };
}

export type TranscriptResult =
  { ok: true; segments: number } | { ok: false; error: "declined" | "empty" | "tooLong" };

/**
 * A transcript exported from the meeting tool (WebVTT, SRT or plain text), stored encrypted
 * (docs/02 M11-5). Refused when the candidate declined recording.
 */
export async function uploadTranscriptAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  raw: string,
): Promise<TranscriptResult> {
  const { ctx, interview, scope } = await workOn(orgSlug, clientSlug, interviewId);
  if (!interview.recordingAllowed) return { ok: false, error: "declined" };
  if (typeof raw !== "string" || raw.length > MAX_TRANSCRIPT_CHARS)
    return { ok: false, error: "tooLong" };
  const segments = parseTranscript(raw);
  if (segments.length === 0) return { ok: false, error: "empty" };
  if (segments.length > MAX_SEGMENTS) return { ok: false, error: "tooLong" };
  const values = {
    segmentsEnc: encryptPii(JSON.stringify(segments)),
    segmentCount: segments.length,
    uploadedBy: ctx.userId,
  };
  await withRls(ctx, async (tx) => {
    await tx
      .insert(interviewTranscripts)
      .values({ interviewId: interview.id, ...scope, ...values })
      .onConflictDoUpdate({ target: interviewTranscripts.interviewId, set: values });
    await recordEvent(tx, {
      ...scope,
      actor: "staff",
      actorId: ctx.userId,
      type: "transcript.uploaded",
      payload: { interviewId: interview.id, segments: segments.length },
    });
  });
  revalidatePath(page(ctx, interview.id));
  return { ok: true, segments: segments.length };
}

/** Asks for the AI report; it is drafted in the background (docs/02 M11-6). */
export async function requestReportAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
): Promise<{ ok: true } | { ok: false; error: "noTranscript" | "quota" }> {
  const { ctx, interview, scope } = await workOn(orgSlug, clientSlug, interviewId);
  if (await aiQuotaReached(getAdminDb(), ctx.orgId, new Date()))
    return { ok: false, error: "quota" };
  const started = await withRls(ctx, async (tx) => {
    const [transcript] = await tx
      .select({ id: interviewTranscripts.interviewId })
      .from(interviewTranscripts)
      .where(eq(interviewTranscripts.interviewId, interview.id));
    if (!transcript) return false;
    const pending = { status: "pending" as const, error: null, requestedBy: ctx.userId };
    await tx
      .insert(interviewReports)
      .values({ interviewId: interview.id, ...scope, ...pending })
      .onConflictDoUpdate({ target: interviewReports.interviewId, set: pending });
    return true;
  });
  if (!started) return { ok: false, error: "noTranscript" };
  await sendEventBestEffort(
    reportRequested.create({ interviewId: interview.id, orgId: ctx.orgId }),
  );
  revalidatePath(page(ctx, interview.id));
  return { ok: true };
}

const DECISION_CHANGE = {
  pass: "offer",
  next_round: "next_round",
  fail: "rejected",
  withdrawn: "withdrawn",
} as const;

export type DecisionResult = { ok: true } | { ok: false; error: "notAllowed" | "decided" };

/**
 * The decision after an interview (docs/02 M11-4): the application moves at once, while the
 * emails it causes (next-round invitation, rejection notice) wait for the undo window.
 */
export async function decideAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  decision: keyof typeof DECISION_CHANGE,
): Promise<DecisionResult> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const id = z.uuid().parse(interviewId);
  const parsed = z.enum(["pass", "next_round", "fail", "withdrawn"]).parse(decision);
  const result = await withRls(
    ctx,
    async (tx): Promise<DecisionResult | { ok: true; decisionId: string; canceled: string[] }> => {
      const [interview] = await tx
        .select({ applicationId: interviews.applicationId, status: interviews.status })
        .from(interviews)
        .where(
          and(
            eq(interviews.id, id),
            eq(interviews.orgId, ctx.orgId),
            eq(interviews.clientId, ctx.clientId),
          ),
        )
        .for("update");
      if (!interview || interview.status === "canceled") return { ok: false, error: "notAllowed" };
      const [open] = await tx
        .select({ id: interviewDecisions.id })
        .from(interviewDecisions)
        .where(and(eq(interviewDecisions.interviewId, id), isNull(interviewDecisions.undoneAt)));
      if (open) return { ok: false, error: "decided" };
      // Deciding means the interview took place.
      if (interview.status === "scheduled") {
        await tx.update(interviews).set({ status: "done" }).where(eq(interviews.id, id));
      }
      const change = await applyStageChange(
        tx,
        ctx,
        interview.applicationId,
        DECISION_CHANGE[parsed],
        null,
      );
      if (!change) return { ok: false, error: "notAllowed" };
      const [row] = await tx
        .insert(interviewDecisions)
        .values({
          orgId: ctx.orgId,
          clientId: ctx.clientId,
          applicationId: interview.applicationId,
          interviewId: id,
          decision: parsed,
          decidedBy: ctx.userId,
          // The interview's status too: deciding marks a still-scheduled interview as done.
          previous: { ...change.previous, interviewStatus: interview.status },
          invitationId: change.invitationId,
          effectiveAt: sql`now() + make_interval(mins => ${UNDO_MINUTES})`,
        })
        .returning({ id: interviewDecisions.id });
      await recordEvent(tx, {
        orgId: ctx.orgId,
        clientId: ctx.clientId,
        applicationId: interview.applicationId,
        actor: "staff",
        actorId: ctx.userId,
        type: "decision.made",
        payload: { interviewId: id, decision: parsed },
      });
      return { ok: true, decisionId: row!.id, canceled: change.canceledInterviews };
    },
  );
  if (!result.ok) return result;
  if ("decisionId" in result) {
    // Stopping reminders of other interviews sends no email, so it needn't wait.
    for (const interviewId of result.canceled) {
      await sendEventBestEffort(interviewChanged.create({ interviewId, orgId: ctx.orgId }));
    }
    await sendEventBestEffort(
      decisionMade.create({ decisionId: result.decisionId, orgId: ctx.orgId }),
    );
  }
  revalidatePath(`/app/${ctx.orgSlug}/${ctx.clientSlug}`, "layout");
  return { ok: true };
}

async function restore(tx: Tx, applicationId: string, previous: PreviousState) {
  await tx
    .update(applications)
    .set({
      stage: previous.stage,
      outcome: previous.outcome,
      currentRound: previous.currentRound,
      waitingOn: previous.waitingOn,
      nextAction: previous.nextAction,
      closeReason: previous.closeReason,
    })
    .where(eq(applications.id, applicationId));
}

/** Takes a decision back within the undo window; nothing was emailed yet (docs/02 M11-4). */
export async function undoDecisionAction(
  orgSlug: string,
  clientSlug: string,
  decisionId: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const id = z.uuid().parse(decisionId);
  const ok = await withRls(ctx, async (tx) => {
    const [decision] = await tx
      .update(interviewDecisions)
      .set({ undoneAt: sql`now()` })
      .where(
        and(
          eq(interviewDecisions.id, id),
          eq(interviewDecisions.orgId, ctx.orgId),
          eq(interviewDecisions.clientId, ctx.clientId),
          isNull(interviewDecisions.undoneAt),
          gt(interviewDecisions.effectiveAt, sql`now()`),
        ),
      )
      .returning();
    if (!decision) return false;
    const previous = decision.previous as PreviousState & { interviewStatus?: string };
    await restore(tx, decision.applicationId, previous);
    if (previous.interviewStatus === "scheduled") {
      await tx
        .update(interviews)
        .set({ status: "scheduled" })
        .where(and(eq(interviews.id, decision.interviewId), eq(interviews.status, "done")));
    }
    if (decision.invitationId) {
      await tx
        .update(interviewInvitations)
        .set({ status: "canceled" })
        .where(eq(interviewInvitations.id, decision.invitationId));
    }
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId: decision.applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: "decision.undone",
      payload: { interviewId: decision.interviewId, decision: decision.decision },
    });
    return true;
  });
  revalidatePath(`/app/${ctx.orgSlug}/${ctx.clientSlug}`, "layout");
  return { ok };
}
