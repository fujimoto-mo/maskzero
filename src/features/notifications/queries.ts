import "server-only";
import { and, asc, desc, eq, gt, gte, lt, or, sql } from "drizzle-orm";
import { addDays, jstDateKey, jstInstant } from "@/features/scheduling/slots";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { applications, candidates, events, interviews, profiles } from "@/server/db/schema";

export type NotificationKind =
  "application" | "review" | "requested" | "unmatched" | "scheduled" | "tomorrow";

export type NotificationItem = {
  kind: NotificationKind;
  applicationId: string;
  jobId: string;
  name: string;
  /** When it happened; for "tomorrow", when the interview starts. */
  at: string;
  unread: boolean;
};

const EVENT_KINDS: Record<string, NotificationKind> = {
  "application.created": "application",
  "screening.completed": "review",
  "booking.requested": "requested",
  "booking.unmatched": "unmatched",
  "interview.scheduled": "scheduled",
};

/**
 * In-app notifications (docs/02 M6-4): new entries and applications that need a person (P1),
 * booking answers, confirmed interviews and tomorrow's interviews (P2). Built from the event log
 * and the interview calendar; anything newer than profiles.notifications_seen_at is unread.
 */
export async function getNotifications(
  ctx: MemberCtx,
  now: Date,
): Promise<{ items: NotificationItem[]; unread: number }> {
  const today = jstDateKey(now);
  const todayStart = jstInstant(today, "00:00");
  return withRls(ctx, async (tx) => {
    const [[profile], rows, tomorrow] = await Promise.all([
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
            // Nobody needs to hear about what they just did themselves.
            sql`${events.actorId} is distinct from ${ctx.userId}`,
            or(
              and(eq(events.type, "application.created"), eq(events.actor, "candidate")),
              and(
                eq(events.type, "screening.completed"),
                sql`${events.payload}->>'verdict' in ('check', 'fail_pending')`,
              ),
              // With automatic confirmation the request turns into a booking or "unmatched".
              and(
                eq(events.type, "booking.requested"),
                sql`${events.payload}->>'confirmMode' = 'manual'`,
              ),
              eq(events.type, "booking.unmatched"),
              eq(events.type, "interview.scheduled"),
            ),
          ),
        )
        .orderBy(desc(events.occurredAt))
        .limit(20),
      tx
        .select({
          applicationId: applications.id,
          jobId: applications.jobId,
          name: candidates.name,
          startsAt: interviews.startsAt,
        })
        .from(interviews)
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .where(
          and(
            eq(interviews.orgId, ctx.orgId),
            eq(interviews.clientId, ctx.clientId),
            eq(interviews.status, "scheduled"),
            gte(interviews.startsAt, jstInstant(addDays(today, 1), "00:00")),
            lt(interviews.startsAt, jstInstant(addDays(today, 2), "00:00")),
          ),
        )
        .orderBy(asc(interviews.startsAt))
        .limit(10),
    ]);
    const seenAt = profile?.seenAt ?? null;
    const items: NotificationItem[] = [
      // Tomorrow's interviews come first and count as new until the bell is cleared today.
      ...tomorrow.map((r) => ({
        kind: "tomorrow" as const,
        applicationId: r.applicationId,
        jobId: r.jobId,
        name: r.name,
        at: r.startsAt.toISOString(),
        unread: !seenAt || seenAt < todayStart,
      })),
      ...rows.map((r) => ({
        kind: EVENT_KINDS[r.type] ?? ("review" as const),
        applicationId: r.applicationId,
        jobId: r.jobId,
        name: r.name,
        at: r.at.toISOString(),
        unread: !seenAt || r.at > seenAt,
      })),
    ];
    return { items, unread: items.filter((i) => i.unread).length };
  });
}
