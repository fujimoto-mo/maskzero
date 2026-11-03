import "server-only";
import { sql } from "drizzle-orm";
import { jstInstant } from "@/features/scheduling/slots";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import type { AppSteps, Period } from "./domain";

/** Cap on the cohort; past it the page says the figures cover the first N applications. */
export const COHORT_LIMIT = 5000;

/**
 * One row per application that applied in the period, with the first time it reached each step,
 * from the events table (docs/02 M10-6), and the job-board notifications of the period.
 */
export async function getAnalytics(
  ctx: MemberCtx,
  period: Period,
): Promise<{ rows: AppSteps[]; notified: number; notifiedEntered: number; truncated: boolean }> {
  // ISO strings: raw SQL parameters are not typed from a column, so Dates are not converted.
  const from = jstInstant(period.from, "00:00").toISOString();
  const to = jstInstant(period.to, "00:00").toISOString();
  return withRls(ctx, async (tx) => {
    const [steps, [waits]] = await Promise.all([
      tx.execute<{
        channel: string;
        entered: string;
        passed: string | null;
        opened: string | null;
        scheduled: string | null;
        held: string | null;
        offer: string | null;
        hired: string | null;
      }>(sql`
        with cohort as (
          select a.id, coalesce(a.channel, a.source::text) as channel, a.applied_at
          from applications a
          where a.org_id = ${ctx.orgId} and a.client_id = ${ctx.clientId}
            and a.applied_at >= ${from}::timestamptz and a.applied_at < ${to}::timestamptz
          order by a.applied_at
          limit ${COHORT_LIMIT + 1}
        )
        select c.channel, c.applied_at as entered,
          min(e.occurred_at) filter (
            where e.type = 'invitation.sent' and coalesce((e.payload->>'round')::int, 1) = 1) as passed,
          min(e.occurred_at) filter (
            where e.type = 'invitation.opened' and coalesce((e.payload->>'round')::int, 1) = 1) as opened,
          min(e.occurred_at) filter (where e.type = 'interview.scheduled') as scheduled,
          min(e.occurred_at) filter (where e.type = 'interview.done') as held,
          min(e.occurred_at) filter (
            where e.type = 'application.stage_changed' and e.payload->>'change' = 'offer') as offer,
          min(e.occurred_at) filter (
            where e.type = 'application.stage_changed' and e.payload->>'change' = 'hired') as hired
        from cohort c
        left join events e on e.application_id = c.id and e.org_id = ${ctx.orgId}
        group by c.id, c.channel, c.applied_at`),
      tx.execute<{ notified: number; entered: number }>(sql`
        select count(*)::int as notified,
          count(*) filter (where w.status = 'entered')::int as entered
        from entry_waits w
        where w.org_id = ${ctx.orgId} and w.client_id = ${ctx.clientId}
          and w.notified_at >= ${from}::timestamptz and w.notified_at < ${to}::timestamptz`),
    ]);
    const date = (v: string | null) => (v ? new Date(v) : null);
    return {
      rows: steps.slice(0, COHORT_LIMIT).map((r) => ({
        channel: r.channel,
        entered: new Date(r.entered),
        passed: date(r.passed),
        opened: date(r.opened),
        scheduled: date(r.scheduled),
        held: date(r.held),
        offer: date(r.offer),
        hired: date(r.hired),
      })),
      notified: waits?.notified ?? 0,
      notifiedEntered: waits?.entered ?? 0,
      truncated: steps.length > COHORT_LIMIT,
    };
  });
}
