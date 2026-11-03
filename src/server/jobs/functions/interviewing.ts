import { and, eq } from "drizzle-orm";
import {
  averageScore,
  locateQuote,
  renderTranscript,
  type Segment,
} from "@/features/interviews/rubric";
import { postingFieldsSchema } from "@/features/jobs/schema";
import { maskForScreening } from "@/features/screening/text";
import { draftReport, REPORT_PROMPT_VERSION } from "@/server/ai/interview-report";
import { AiOutputError } from "@/server/ai/client";
import { decryptPii } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import {
  applications,
  candidates,
  interviewDecisions,
  interviewReports,
  interviews,
  interviewTranscripts,
  jobs,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { inngest } from "../client";
import { applicationRejected, decisionMade, invitationCreated, reportRequested } from "../events";

// The interview workspace's background work (docs/02 M11). Step results carry IDs, numbers and
// codes only; the transcript and report text stay in the database.

const REPORT_RETRIES = 2;

/** Drafts the AI report from the transcript, with quotes checked against it (M11-6). */
export const interviewReportJob = inngest.createFunction(
  {
    id: "interview-report",
    triggers: [reportRequested],
    retries: REPORT_RETRIES,
    concurrency: { key: "event.data.orgId", limit: 3 },
    onFailure: async ({ event }) => {
      const { interviewId, orgId } = event.data.event.data;
      await getAdminDb()
        .update(interviewReports)
        .set({ status: "failed", error: "ai" })
        .where(
          and(eq(interviewReports.interviewId, interviewId), eq(interviewReports.orgId, orgId)),
        );
    },
  },
  async ({ event, step }) => {
    const { interviewId, orgId } = event.data;
    return step.run("draft", async () => {
      const db = getAdminDb();
      const [row] = await db
        .select({
          clientId: interviews.clientId,
          applicationId: interviews.applicationId,
          purpose: interviews.purpose,
          segmentsEnc: interviewTranscripts.segmentsEnc,
          name: candidates.name,
          postingFields: jobs.postingFields,
          jobTitle: jobs.title,
        })
        .from(interviews)
        .innerJoin(interviewTranscripts, eq(interviewTranscripts.interviewId, interviews.id))
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)));
      if (!row) return { status: "notFound" };
      const segments = JSON.parse(decryptPii(row.segmentsEnc)) as Segment[];
      // The model doesn't need the candidate's name, address or contact details.
      const masked = segments.map((s) => ({ ...s, text: maskForScreening(s.text, [row.name]) }));
      const fields = postingFieldsSchema.catch({}).parse(row.postingFields);
      try {
        const draft = await draftReport({
          orgId,
          job: { title: fields.title ?? row.jobTitle, description: fields.description ?? "" },
          purpose: row.purpose,
          transcript: renderTranscript(masked),
          segments: masked,
        });
        const scores = draft.scores.map((s) => ({
          criterionId: s.criterionId,
          score: s.score,
          comment: s.comment,
          evidence: s.quotes.map((quote) => ({ quote, ...locateQuote(quote, masked) })),
        }));
        const total = averageScore(Object.fromEntries(scores.map((s) => [s.criterionId, s.score])));
        await db.transaction(async (tx) => {
          await tx
            .update(interviewReports)
            .set({
              status: "ready",
              scores,
              total: total === null ? null : total.toFixed(2),
              summary: draft.summary,
              needs: draft.needs,
              model: draft.model,
              promptVersion: REPORT_PROMPT_VERSION,
              error: null,
            })
            .where(eq(interviewReports.interviewId, interviewId));
          await recordEvent(tx, {
            orgId,
            clientId: row.clientId,
            applicationId: row.applicationId,
            actor: "system",
            type: "report.created",
            payload: { interviewId, total },
          });
        });
        return { status: "ready", total };
      } catch (error) {
        // Refusals and unusable output won't improve on retry: tell the person instead.
        if (error instanceof AiOutputError) {
          await db
            .update(interviewReports)
            .set({ status: "failed", error: error.reason })
            .where(eq(interviewReports.interviewId, interviewId));
          return { status: "failed", reason: error.reason };
        }
        throw error;
      }
    });
  },
);

/**
 * A decision's emails wait out its undo window (M11-4): then, if it still stands, the next-round
 * invitation or the rejection notice starts on its way.
 */
export const decisionEffects = inngest.createFunction(
  { id: "interview-decision-effects", triggers: [decisionMade] },
  async ({ event, step }) => {
    const { decisionId, orgId } = event.data;
    const decision = await step.run("load", async () => {
      const [row] = await getAdminDb()
        .select({
          decision: interviewDecisions.decision,
          applicationId: interviewDecisions.applicationId,
          invitationId: interviewDecisions.invitationId,
          effectiveAt: interviewDecisions.effectiveAt,
        })
        .from(interviewDecisions)
        .where(and(eq(interviewDecisions.id, decisionId), eq(interviewDecisions.orgId, orgId)));
      return row ? { ...row, effectiveAt: row.effectiveAt.toISOString() } : null;
    });
    if (!decision) return { skipped: "notFound" };
    await step.sleepUntil("undo-window", decision.effectiveAt);
    const stands = await step.run("still-stands", async () => {
      const [row] = await getAdminDb()
        .select({ undoneAt: interviewDecisions.undoneAt })
        .from(interviewDecisions)
        .where(eq(interviewDecisions.id, decisionId));
      return Boolean(row && !row.undoneAt);
    });
    if (!stands) return { skipped: "undone" };
    if (decision.decision === "next_round" && decision.invitationId) {
      await step.sendEvent(
        "send-invitation",
        invitationCreated.create({ invitationId: decision.invitationId, orgId }),
      );
    }
    if (decision.decision === "fail") {
      await step.sendEvent(
        "send-rejection",
        applicationRejected.create({ applicationId: decision.applicationId, orgId }),
      );
    }
    return { applied: decision.decision };
  },
);
