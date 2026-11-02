import "server-only";
import { and, desc, eq, gt, or, sql } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { applications, candidates, events, profiles } from "@/server/db/schema";

export type NotificationItem = {
  kind: "application" | "review";
  applicationId: string;
  jobId: string;
  name: string;
  at: string;
  unread: boolean;
};

/**
 * In-app notifications (docs/02 M6-4, P1): new entries and applications that need a person. Built
 * from the event log; anything newer than profiles.notifications_seen_at is unread.
 */
export async function getNotifications(
  ctx: MemberCtx,
): Promise<{ items: NotificationItem[]; unread: number }> {
  return withRls(ctx, async (tx) => {
    const [[profile], rows] = await Promise.all([
      tx
        .select({ seenAt: profiles.notificationsSeenAt })
        .from(profiles)
        .where(eq(profiles.id, ctx.userId)),
      tx
        .select({
          type: events.type,
          at: events.occurredAt,
          applicationId: applications.id,
          jobId: applications.jobId,
          name: candidates.name,
        })
        .from(events)
        .innerJoin(applications, eq(applications.id, events.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .where(
          and(
            eq(events.orgId, ctx.orgId),
            eq(events.clientId, ctx.clientId),
            gt(events.occurredAt, sql`now() - interval '30 days'`),
            or(
              and(eq(events.type, "application.created"), eq(events.actor, "candidate")),
              and(
                eq(events.type, "screening.completed"),
                sql`${events.payload}->>'verdict' in ('check', 'fail_pending')`,
              ),
            ),
          ),
        )
        .orderBy(desc(events.occurredAt))
        .limit(20),
    ]);
    const seenAt = profile?.seenAt ?? null;
    const items = rows.map((r) => ({
      kind: r.type === "application.created" ? ("application" as const) : ("review" as const),
      applicationId: r.applicationId,
      jobId: r.jobId,
      name: r.name,
      at: r.at.toISOString(),
      unread: !seenAt || r.at > seenAt,
    }));
    return { items, unread: items.filter((i) => i.unread).length };
  });
}
