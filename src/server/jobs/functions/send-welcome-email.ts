import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { getAdminDb } from "@/server/db/admin";
import { organizations, profiles } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { inngest } from "../client";
import { orgCreated } from "../events";

/** Phase 0 hello-world job: welcome the owner of a newly created org. */
export const sendWelcomeEmail = inngest.createFunction(
  { id: "send-welcome-email", triggers: [orgCreated] },
  async ({ event, step }) => {
    // Lookup and send happen in one step, so the email address never lands in Inngest's step state.
    return step.run("send-email", async () => {
      const db = getAdminDb();
      const [user] = await db
        .select({ email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, event.data.userId));
      const [org] = await db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, event.data.orgId));
      if (!user?.email || !org) throw new NonRetriableError("user or organization not found");

      const result = await sendEmail({
        to: user.email,
        subject: "mask0へようこそ",
        text: [
          `${org.name} の登録が完了しました。`,
          "",
          "これから、求人原稿の作成やAIによる書類選考の設定を進められるようになります。",
          "ご不明な点があれば、このメールにご返信ください。",
          "",
          "mask0",
        ].join("\n"),
      });
      return { messageId: result.id, dryRun: result.dryRun };
    });
  },
);
