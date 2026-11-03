import { and, arrayContains, eq, gte, lt, sql } from "drizzle-orm";
import type { EmailNotificationKind } from "@/features/notifications/kinds";
import { addDays, formatSlot, jstDateKey, jstInstant } from "@/features/scheduling/slots";
import { getPublicEnv } from "@/lib/env";
import { getAdminDb } from "@/server/db/admin";
import {
  applications,
  candidates,
  clients,
  interviews,
  jobs,
  memberships,
  notificationSettings,
  organizations,
  profiles,
} from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { inngest } from "../client";
import { interviewScheduled, staffNotify } from "../events";

// Email copies of staff notifications, for members who asked for them (docs/02 M6-4). Step
// results are counts only; names stay inside the steps.

const SUBJECTS: Record<Exclude<EmailNotificationKind, "tomorrow_digest">, string> = {
  new_application: "新しい応募がありました",
  needs_review: "書類選考の確認が必要です",
  booking_request: "面接日程の確定が必要です",
  interview_confirmed: "面接日時が確定しました",
  candidate_reply: "応募者から返信が届きました",
  ai_interview: "AI面接の確認が必要です",
};

const PAGES: Record<Exclude<EmailNotificationKind, "tomorrow_digest">, string> = {
  new_application: "candidates",
  needs_review: "candidates",
  booking_request: "interviews?tab=action",
  interview_confirmed: "interviews?tab=scheduled",
  candidate_reply: "messages",
  ai_interview: "ai-interviews",
};

/** Active members who can see the client and want this kind by email. */
async function recipients(orgId: string, clientId: string, kind: EmailNotificationKind) {
  return getAdminDb()
    .select({ email: profiles.email })
    .from(notificationSettings)
    .innerJoin(
      memberships,
      and(
        eq(memberships.orgId, notificationSettings.orgId),
        eq(memberships.userId, notificationSettings.userId),
      ),
    )
    .innerJoin(profiles, eq(profiles.id, notificationSettings.userId))
    .where(
      and(
        eq(notificationSettings.orgId, orgId),
        eq(memberships.status, "active"),
        arrayContains(notificationSettings.emailKinds, [kind]),
        sql`(${memberships.clientIds} is null or ${clientId} = any(${memberships.clientIds}))`,
      ),
    );
}

export const staffNotificationEmail = inngest.createFunction(
  { id: "staff-notification-email", triggers: [staffNotify, interviewScheduled] },
  async ({ event, step }) => {
    const kind = "kind" in event.data ? event.data.kind : "interview_confirmed";
    const orgId = event.data.orgId;
    return step.run("send", async () => {
      const db = getAdminDb();
      let applicationId = "applicationId" in event.data ? event.data.applicationId : null;
      if ("interviewId" in event.data) {
        const [interview] = await db
          .select({ applicationId: interviews.applicationId })
          .from(interviews)
          .where(and(eq(interviews.id, event.data.interviewId), eq(interviews.orgId, orgId)));
        applicationId = interview?.applicationId ?? null;
      }
      if (!applicationId) return { sent: 0 };
      const [app] = await db
        .select({
          clientId: applications.clientId,
          name: candidates.name,
          job: jobs.title,
          orgSlug: organizations.slug,
          clientSlug: clients.slug,
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(organizations, eq(organizations.id, applications.orgId))
        .innerJoin(clients, eq(clients.id, applications.clientId))
        .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
      if (!app) return { sent: 0 };
      const to = await recipients(orgId, app.clientId, kind);
      const base = `${getPublicEnv().appUrl}/app/${app.orgSlug}/${app.clientSlug}`;
      const page = PAGES[kind];
      const link =
        page === "candidates" ? `${base}/candidates?app=${applicationId}` : `${base}/${page}`;
      let sent = 0;
      for (const { email } of to) {
        try {
          await sendEmail({
            to: email,
            // No name in the subject: dry runs log subjects (src/server/email/send.ts).
            subject: `【mask0】${SUBJECTS[kind]}`,
            text: [
              `${SUBJECTS[kind]}。`,
              "",
              `応募者：${app.name}さん`,
              `求人：${app.job}`,
              "",
              link,
              "",
              "このメールの受け取りは、mask0の 設定 → 通知 で変更できます。",
            ].join("\n"),
          });
          sent++;
        } catch {
          // One failed address doesn't stop the others; the in-app notification still shows.
        }
      }
      return { sent };
    });
  },
);

/** At 18:00 Japan time, members who asked get tomorrow's interviews in one email. */
export const tomorrowDigest = inngest.createFunction(
  { id: "tomorrow-interviews-digest", triggers: [{ cron: "TZ=Asia/Tokyo 0 18 * * *" }] },
  async ({ step }) => {
    return step.run("send", async () => {
      const db = getAdminDb();
      const tomorrow = addDays(jstDateKey(new Date()), 1);
      const from = jstInstant(tomorrow, "00:00");
      const to = jstInstant(addDays(tomorrow, 1), "00:00");
      const rows = await db
        .select({
          orgId: interviews.orgId,
          clientId: interviews.clientId,
          startsAt: interviews.startsAt,
          endsAt: interviews.endsAt,
          name: candidates.name,
          job: jobs.title,
          clientName: clients.name,
          orgKind: organizations.kind,
        })
        .from(interviews)
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(clients, eq(clients.id, interviews.clientId))
        .innerJoin(organizations, eq(organizations.id, interviews.orgId))
        .where(
          and(
            eq(interviews.status, "scheduled"),
            gte(interviews.startsAt, from),
            lt(interviews.startsAt, to),
          ),
        )
        .orderBy(interviews.startsAt);
      const members = await db
        .select({
          orgId: notificationSettings.orgId,
          email: profiles.email,
          clientIds: memberships.clientIds,
        })
        .from(notificationSettings)
        .innerJoin(
          memberships,
          and(
            eq(memberships.orgId, notificationSettings.orgId),
            eq(memberships.userId, notificationSettings.userId),
          ),
        )
        .innerJoin(profiles, eq(profiles.id, notificationSettings.userId))
        .where(
          and(
            eq(memberships.status, "active"),
            arrayContains(notificationSettings.emailKinds, ["tomorrow_digest"]),
          ),
        );
      let sent = 0;
      for (const member of members) {
        const mine = rows.filter(
          (r) =>
            r.orgId === member.orgId &&
            (member.clientIds === null || member.clientIds.includes(r.clientId)),
        );
        if (mine.length === 0) continue;
        const lines = mine.map((r) => {
          const where = r.orgKind === "agency" ? `（${r.clientName}）` : "";
          return `・${formatSlot(r)} ${r.name}さん／${r.job}${where}`;
        });
        try {
          await sendEmail({
            to: member.email,
            subject: `【mask0】明日の面接（${mine.length}件）`,
            text: [
              "明日の面接の予定です。",
              "",
              ...lines,
              "",
              "このメールの受け取りは、mask0の 設定 → 通知 で変更できます。",
            ].join("\n"),
          });
          sent++;
        } catch {
          // Keep going for the other members.
        }
      }
      return { interviews: rows.length, sent };
    });
  },
);
