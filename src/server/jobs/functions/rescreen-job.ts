import { applicationsToRescreen } from "@/server/screening/pipeline";
import { inngest } from "../client";
import { applicationRescreen, criteriaChanged } from "../events";

/**
 * Re-screens a job's open applications after its criteria change, re-using the stored transcripts
 * (docs/02 M4-8). Debounced, so a burst of edits causes one pass.
 */
export const rescreenJob = inngest.createFunction(
  {
    id: "rescreen-job",
    triggers: [criteriaChanged],
    debounce: { key: "event.data.jobId", period: "30s" },
  },
  async ({ event, step }) => {
    const { jobId, orgId } = event.data;
    const ids = await step.run("find-applications", () => applicationsToRescreen(jobId, orgId));
    if (ids.length > 0) {
      await step.sendEvent(
        "rescreen",
        ids.map((applicationId) => applicationRescreen.create({ applicationId, orgId })),
      );
    }
    return { count: ids.length };
  },
);
