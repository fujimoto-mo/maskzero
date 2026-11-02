import { findStuckApplications } from "@/server/screening/pipeline";
import { inngest } from "../client";
import { applicationSubmitted } from "../events";

/**
 * The outbox sweep: entries are saved before their event is sent, so an event lost to an outage
 * leaves the application waiting on the system. Re-send those every ten minutes.
 */
export const sweepPendingApplications = inngest.createFunction(
  { id: "sweep-pending-applications", triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => {
    const stuck = await step.run("find-stuck", () => findStuckApplications());
    if (stuck.length > 0) {
      await step.sendEvent(
        "resend",
        stuck.map((s) => applicationSubmitted.create(s)),
      );
    }
    return { resent: stuck.length };
  },
);
