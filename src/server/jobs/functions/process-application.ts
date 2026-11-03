import { aiQuotaReached } from "@/features/billing/limits";
import { getAdminDb } from "@/server/db/admin";
import {
  documentsToRead,
  markProcessingFailed,
  readOne,
  screenApplication,
  verifyDocuments,
} from "@/server/screening/pipeline";
import { inngest } from "../client";
import {
  applicationRescreen,
  applicationSubmitted,
  invitationCreated,
  staffNotify,
} from "../events";

const RETRIES = 3;

/**
 * Verify → read → screen for one application (docs/05 §6). Each document is read in its own step,
 * so a retry never pays for reading a finished document again.
 */
export const processApplication = inngest.createFunction(
  {
    id: "process-application",
    triggers: [applicationSubmitted, applicationRescreen],
    retries: RETRIES,
    // One run per application at a time (a newer run sees the newer documents), and a fair share
    // of the AI per company.
    concurrency: [
      { key: "event.data.applicationId", limit: 1 },
      { key: "event.data.orgId", limit: 10 },
    ],
    onFailure: async ({ event }) => {
      const { applicationId, orgId } = event.data.event.data;
      await markProcessingFailed(applicationId, orgId);
    },
  },
  async ({ event, step, attempt }) => {
    const { applicationId, orgId } = event.data;
    const reread = event.name === applicationRescreen.name && event.data.reread === true;
    // On the last try, AI outages give up gracefully: the application goes to a person.
    const lastAttempt = attempt >= RETRIES;

    await step.run("verify-documents", () => verifyDocuments(applicationId, orgId));
    // Over the plan's monthly AI budget: no AI calls, a person reviews (docs/02 M13-4).
    const overQuota = await step.run("ai-quota", () =>
      aiQuotaReached(getAdminDb(), orgId, new Date()),
    );
    if (overQuota) {
      await step.run("hand-to-person", () => markProcessingFailed(applicationId, orgId, "quota"));
      return { skipped: "aiQuota" };
    }
    const toRead = await step.run("documents-to-read", () =>
      documentsToRead(applicationId, orgId, reread),
    );
    for (const documentId of toRead) {
      await step.run(`read-${documentId}`, () => readOne(documentId, orgId, lastAttempt));
    }
    const result = await step.run("screen", () =>
      screenApplication(applicationId, orgId, lastAttempt),
    );
    // "Needs review" and "rejection to confirm" wait for a person (docs/02 M6-4).
    if ("verdict" in result && (result.verdict === "check" || result.verdict === "fail_pending")) {
      await step.sendEvent(
        "notify-staff",
        staffNotify.create({ applicationId, orgId, kind: "needs_review" }),
      );
    }
    // A pass invites the candidate to book an interview (docs/02 M7-1).
    if ("invitationId" in result && result.invitationId) {
      await step.sendEvent(
        "send-invitation",
        invitationCreated.create({ invitationId: result.invitationId, orgId }),
      );
    }
    return result;
  },
);
