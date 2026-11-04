import "server-only";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { aiQuotaReached } from "@/features/billing/limits";
import { postingFieldsSchema } from "@/features/jobs/schema";
import { maskForScreening } from "@/features/screening/text";
import { suggestFollowUps } from "@/server/ai/live-assist";
import { decryptOptional, decryptPii, encryptPii } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import { withRls } from "@/server/db/rls";
import {
  applications,
  bookingRequests,
  candidates,
  concernOptions,
  interviewAssists,
  interviewLiveSegments,
  interviewQuestions,
  interviewReports,
  interviews,
  interviewTranscripts,
  jobs,
  type TranscriptSegment,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import type { MemberCtx } from "@/server/auth/session";
import { removeBot } from "@/server/integrations/providers";
import { ASSIST_MIN_SEGMENTS, type AssistSuggestion, renderLive, type Utterance } from "./live";

// The meeting bot's transcript while the interview runs, the AI's suggestions on it (docs/02
// M11-5, M11-7), and the transcript it leaves for the report (M11-6). Writes happen on the admin
// connection (the bot's webhook, background jobs); staff read through RLS.

const LIVE_STATUSES = ["scheduled", "done"] as const;

async function interviewScope(interviewId: string, orgId?: string) {
  const [row] = await getAdminDb()
    .select({
      orgId: interviews.orgId,
      clientId: interviews.clientId,
      applicationId: interviews.applicationId,
      status: interviews.status,
      recordingAllowed: interviews.recordingAllowed,
      externalIds: interviews.externalIds,
    })
    .from(interviews)
    .where(
      orgId
        ? and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId))
        : eq(interviews.id, interviewId),
    );
  return row ?? null;
}

export type IngestOutcome =
  | { status: "stored"; orgId: string }
  | { status: "ignored"; reason: "notFound" | "closed" | "declined" };

/**
 * Stores one utterance the bot heard. Nothing is kept for a canceled interview or once the
 * candidate declined recording; in that case the bot is also sent away.
 */
export async function ingestUtterance(
  interviewId: string,
  utterance: Utterance,
): Promise<IngestOutcome> {
  const row = await interviewScope(interviewId);
  if (!row) return { status: "ignored", reason: "notFound" };
  if (!row.recordingAllowed) {
    if (row.externalIds.bot) await removeBot(row.externalIds.bot).catch(() => undefined);
    return { status: "ignored", reason: "declined" };
  }
  if (!(LIVE_STATUSES as readonly string[]).includes(row.status)) {
    return { status: "ignored", reason: "closed" };
  }
  await getAdminDb()
    .insert(interviewLiveSegments)
    .values({
      orgId: row.orgId,
      clientId: row.clientId,
      applicationId: row.applicationId,
      interviewId,
      at: utterance.at,
      speakerEnc: utterance.speaker ? encryptPii(utterance.speaker) : null,
      textEnc: encryptPii(utterance.text),
    });
  return { status: "stored", orgId: row.orgId };
}

async function liveUtterances(interviewId: string, afterId?: string | null) {
  const rows = await getAdminDb()
    .select({
      id: interviewLiveSegments.id,
      at: interviewLiveSegments.at,
      speakerEnc: interviewLiveSegments.speakerEnc,
      textEnc: interviewLiveSegments.textEnc,
    })
    .from(interviewLiveSegments)
    .where(
      and(
        eq(interviewLiveSegments.interviewId, interviewId),
        afterId ? gt(interviewLiveSegments.id, afterId) : undefined,
      ),
    )
    .orderBy(asc(interviewLiveSegments.id));
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    speaker: decryptOptional(r.speakerEnc),
    text: decryptPii(r.textEnc),
  }));
}

/** The concerns the candidate ticked when booking this interview. */
async function bookingConcerns(invitationId: string | null): Promise<string[]> {
  if (!invitationId) return [];
  const db = getAdminDb();
  const [request] = await db
    .select({ ids: bookingRequests.concernIds })
    .from(bookingRequests)
    .where(
      and(eq(bookingRequests.invitationId, invitationId), eq(bookingRequests.status, "confirmed")),
    )
    .limit(1);
  if (!request?.ids.length) return [];
  const rows = await db
    .select({ label: concernOptions.label })
    .from(concernOptions)
    .where(inArray(concernOptions.id, request.ids))
    .orderBy(asc(concernOptions.position));
  return rows.map((r) => r.label);
}

export type AssistOutcome = "updated" | "tooShort" | "unchanged" | "quota" | "closed" | "notFound";

/** Refreshes the AI's suggestions from everything heard so far (M11-7). */
export async function refreshAssist(interviewId: string, orgId: string): Promise<AssistOutcome> {
  const db = getAdminDb();
  const [row] = await db
    .select({
      clientId: interviews.clientId,
      applicationId: interviews.applicationId,
      status: interviews.status,
      purpose: interviews.purpose,
      invitationId: interviews.invitationId,
      name: candidates.name,
      postingFields: jobs.postingFields,
      jobTitle: jobs.title,
    })
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)));
  if (!row) return "notFound";
  if (row.status !== "scheduled") return "closed";

  const heard = await liveUtterances(interviewId);
  if (heard.length < ASSIST_MIN_SEGMENTS) return "tooShort";
  const [previous] = await db
    .select({ segmentCount: interviewAssists.segmentCount })
    .from(interviewAssists)
    .where(eq(interviewAssists.interviewId, interviewId));
  if (previous?.segmentCount === heard.length) return "unchanged";
  if (await aiQuotaReached(db, orgId, new Date())) return "quota";

  const [prep] = await db
    .select({ items: interviewQuestions.items })
    .from(interviewQuestions)
    .where(eq(interviewQuestions.interviewId, interviewId));
  // The model doesn't need the candidate's name or contact details, whoever says them.
  const masked = heard.map((u) => ({
    at: u.at,
    speaker: u.speaker ? maskForScreening(u.speaker, [row.name]) : null,
    text: maskForScreening(u.text, [row.name]),
  }));
  const fields = postingFieldsSchema.catch({}).parse(row.postingFields);
  const suggestions = await suggestFollowUps({
    orgId,
    job: { title: fields.title ?? row.jobTitle, description: fields.description ?? "" },
    purpose: row.purpose,
    questions: (prep?.items ?? []).filter((q) => q.picked).map((q) => q.text),
    concerns: await bookingConcerns(row.invitationId),
    transcript: masked,
    rendered: renderLive(masked),
  });
  const values = {
    suggestionsEnc: encryptPii(JSON.stringify(suggestions)),
    segmentCount: heard.length,
  };
  await db
    .insert(interviewAssists)
    .values({
      interviewId,
      orgId,
      clientId: row.clientId,
      applicationId: row.applicationId,
      ...values,
    })
    .onConflictDoUpdate({ target: interviewAssists.interviewId, set: values });
  return "updated";
}

export type FinishOutcome =
  | { status: "saved"; segments: number; report: boolean }
  | { status: "skipped"; reason: "notFound" | "canceled" | "empty" | "uploaded" };

/**
 * After the interview: the live transcript becomes the interview's transcript (unless staff
 * uploaded one), the AI report is requested, and the live copy is deleted (M11-5, M11-6).
 * Returns whether a report was requested, so the caller sends the event.
 */
export async function finishBotTranscript(
  interviewId: string,
  orgId: string,
): Promise<FinishOutcome> {
  const row = await interviewScope(interviewId, orgId);
  if (!row) return { status: "skipped", reason: "notFound" };
  if (row.status === "canceled" || !row.recordingAllowed) {
    await getAdminDb()
      .delete(interviewLiveSegments)
      .where(eq(interviewLiveSegments.interviewId, interviewId));
    return { status: "skipped", reason: "canceled" };
  }
  const heard = await liveUtterances(interviewId);
  if (heard.length === 0) return { status: "skipped", reason: "empty" };
  const scope = { orgId, clientId: row.clientId, applicationId: row.applicationId };
  const db = getAdminDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ source: interviewTranscripts.source })
      .from(interviewTranscripts)
      .where(eq(interviewTranscripts.interviewId, interviewId));
    if (existing?.source === "upload") return { status: "skipped", reason: "uploaded" } as const;

    const segments: TranscriptSegment[] = heard.map((u) => ({
      t: u.at === null ? null : Math.round(u.at),
      speaker: u.speaker,
      text: u.text,
    }));
    const values = {
      segmentsEnc: encryptPii(JSON.stringify(segments)),
      segmentCount: Math.min(segments.length, 32767),
      source: "bot",
      uploadedBy: null,
    };
    await tx
      .insert(interviewTranscripts)
      .values({ interviewId, ...scope, ...values })
      .onConflictDoUpdate({ target: interviewTranscripts.interviewId, set: values });
    await tx
      .delete(interviewLiveSegments)
      .where(eq(interviewLiveSegments.interviewId, interviewId));
    await recordEvent(tx, {
      ...scope,
      actor: "system",
      type: "transcript.recorded",
      payload: { interviewId, segments: segments.length },
    });

    // The report follows on its own, unless one exists or the month's AI budget is spent.
    const [report] = await tx
      .select({ status: interviewReports.status })
      .from(interviewReports)
      .where(eq(interviewReports.interviewId, interviewId));
    const wantReport =
      (!report || report.status === "failed") && !(await aiQuotaReached(tx, orgId, new Date()));
    if (wantReport) {
      const pending = { status: "pending" as const, error: null, requestedBy: null };
      await tx
        .insert(interviewReports)
        .values({ interviewId, ...scope, ...pending })
        .onConflictDoUpdate({ target: interviewReports.interviewId, set: pending });
    }
    return { status: "saved", segments: segments.length, report: wantReport } as const;
  });
}

export type LiveView = {
  status: (typeof interviews.$inferSelect)["status"];
  segments: { id: string; at: number | null; speaker: string | null; text: string }[];
  suggestions: AssistSuggestion[];
  suggestionsAt: string | null;
  /** The interview has its final transcript: the live view is over. */
  finished: boolean;
};

/**
 * What the live page polls: utterances after `afterId`, and the latest suggestions. Null when the
 * member may not see the interview (RLS decides).
 */
export async function getLiveView(
  ctx: MemberCtx,
  interviewId: string,
  afterId: string | null,
): Promise<LiveView | null> {
  return withRls(ctx, async (tx) => {
    const [row] = await tx
      .select({ status: interviews.status })
      .from(interviews)
      .where(
        and(
          eq(interviews.id, interviewId),
          eq(interviews.orgId, ctx.orgId),
          eq(interviews.clientId, ctx.clientId),
        ),
      );
    if (!row) return null;
    const [segments, [assist], [transcript]] = await Promise.all([
      tx
        .select({
          id: interviewLiveSegments.id,
          at: interviewLiveSegments.at,
          speakerEnc: interviewLiveSegments.speakerEnc,
          textEnc: interviewLiveSegments.textEnc,
        })
        .from(interviewLiveSegments)
        .where(
          and(
            eq(interviewLiveSegments.interviewId, interviewId),
            afterId ? gt(interviewLiveSegments.id, afterId) : undefined,
          ),
        )
        .orderBy(asc(interviewLiveSegments.id))
        .limit(500),
      tx
        .select({
          suggestionsEnc: interviewAssists.suggestionsEnc,
          updatedAt: interviewAssists.updatedAt,
        })
        .from(interviewAssists)
        .where(eq(interviewAssists.interviewId, interviewId)),
      tx
        .select({ id: interviewTranscripts.interviewId })
        .from(interviewTranscripts)
        .where(eq(interviewTranscripts.interviewId, interviewId)),
    ]);
    return {
      status: row.status,
      segments: segments.map((s) => ({
        id: s.id,
        at: s.at,
        speaker: decryptOptional(s.speakerEnc),
        text: decryptPii(s.textEnc),
      })),
      suggestions: assist
        ? (JSON.parse(decryptPii(assist.suggestionsEnc)) as AssistSuggestion[])
        : [],
      suggestionsAt: assist?.updatedAt.toISOString() ?? null,
      finished: Boolean(transcript),
    };
  });
}

/** The concerns the candidate ticked when booking, for the live page's side panel. */
export async function getBookingConcerns(ctx: MemberCtx, interviewId: string): Promise<string[]> {
  return withRls(ctx, async (tx) => {
    const [row] = await tx
      .select({ invitationId: interviews.invitationId })
      .from(interviews)
      .where(
        and(
          eq(interviews.id, interviewId),
          eq(interviews.orgId, ctx.orgId),
          eq(interviews.clientId, ctx.clientId),
        ),
      );
    if (!row?.invitationId) return [];
    const [request] = await tx
      .select({ ids: bookingRequests.concernIds })
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.invitationId, row.invitationId),
          eq(bookingRequests.status, "confirmed"),
        ),
      )
      .limit(1);
    if (!request?.ids.length) return [];
    const rows = await tx
      .select({ label: concernOptions.label })
      .from(concernOptions)
      .where(inArray(concernOptions.id, request.ids))
      .orderBy(asc(concernOptions.position));
    return rows.map((r) => r.label);
  });
}
