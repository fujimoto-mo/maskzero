import { purgeExpiredBatch } from "@/server/retention";
import { inngest } from "../client";
import { retentionPurgeRequested } from "../events";

const BATCH = 200;

/** Nightly retention purge at 03:00 Japan time (docs/02 M13-2), in batches of 200. */
export const purgeExpiredApplications = inngest.createFunction(
  {
    id: "purge-expired-applications",
    triggers: [{ cron: "TZ=Asia/Tokyo 0 3 * * *" }, retentionPurgeRequested],
  },
  async ({ step }) => {
    let total = 0;
    for (let batch = 0; batch < 50; batch++) {
      const purged = await step.run(`purge-${batch}`, () => purgeExpiredBatch(BATCH));
      total += purged;
      if (purged < BATCH) break;
    }
    return { purged: total };
  },
);
