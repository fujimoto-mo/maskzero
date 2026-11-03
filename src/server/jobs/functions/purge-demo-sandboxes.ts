import { purgeExpiredSandboxes } from "@/features/demo/server";
import { inngest } from "../client";

const BATCH = 50;

/** Deletes /demo sandboxes whose day is over, with their users and files (docs/02 M13-6). */
export const purgeDemoSandboxes = inngest.createFunction(
  { id: "purge-demo-sandboxes", triggers: [{ cron: "TZ=Asia/Tokyo 15 * * * *" }] },
  async ({ step }) => {
    let total = 0;
    for (let batch = 0; batch < 20; batch++) {
      const purged = await step.run(`purge-${batch}`, () =>
        purgeExpiredSandboxes(new Date(), BATCH),
      );
      total += purged;
      if (purged < BATCH) break;
    }
    return { purged: total };
  },
);
