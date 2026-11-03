import "server-only";
import { sql } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";

// Dashboard numbers (docs/02 M6-1, M6-2). Dates are counted in Japan time.

export type DashboardData = {
  counters: {
    toReview: number;
    toConfirm: number;
    toInvite: number;
    waitingDocuments: number;
    /** Booking requests awaiting manual confirmation or a new slot (docs/02 M6-3). */
    pendingRequests: number;
  };
  /** Today's interviews in Japan time, earliest first. */
  today: {
    interviewId: string;
    applicationId: string;
    name: string;
    startsAt: string;
    endsAt: string;
    round: number;
    meetingUrl: string | null;
  }[];
  /** Applications per job board, this month and last month. */
  boards: { channel: string; thisMonth: number; lastMonth: number }[];
  /** The last 12 months, oldest first, with the same month a year earlier. */
  months: { month: string; count: number; lastYear: number }[];
  funnel: { step: "applied" | "passed" | "interview" | "offer" | "hired"; count: number }[];
  /** The last 14 days, oldest first. */
  days: { date: string; count: number }[];
};

const TZ = "Asia/Tokyo";
const pad = (n: number) => String(n).padStart(2, "0");

/** Today's date and the current month in Japan, as plain strings. */
function japanCalendar(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

export async function getDashboard(ctx: MemberCtx, now: Date): Promise<DashboardData> {
  const scope = sql`a.org_id = ${ctx.orgId} and a.client_id = ${ctx.clientId}`;
  const localNow = sql`(${now.toISOString()}::timestamptz at time zone ${TZ})`;
  const monthStart = sql`(date_trunc('month', ${localNow}) at time zone ${TZ})`;

  const [[counters], boards, months, [funnel], days, [requests], todayRows] = await withRls(
    ctx,
    (tx) =>
      Promise.all([
        tx.execute<{
          to_review: number;
          to_confirm: number;
          to_invite: number;
          waiting_documents: number;
        }>(sql`
        select
          count(*) filter (where verdict in ('check', 'manual_check') and stage in ('applied', 'screening'))::int as to_review,
          count(*) filter (where verdict = 'fail_pending')::int as to_confirm,
          count(*) filter (where stage = 'booking' and waiting_on = 'candidate')::int as to_invite,
          count(*) filter (where waiting_on = 'candidate' and stage = 'applied')::int as waiting_documents
        from applications a
        where ${scope} and a.outcome = 'active'`),
        tx.execute<{ channel: string; this_month: number; last_month: number }>(sql`
        select coalesce(a.channel, a.source::text) as channel,
          count(*) filter (where a.applied_at >= ${monthStart})::int as this_month,
          count(*) filter (where a.applied_at < ${monthStart})::int as last_month
        from applications a
        where ${scope}
          and a.applied_at >= (date_trunc('month', ${localNow}) - interval '1 month') at time zone ${TZ}
        group by 1
        order by 2 desc, 3 desc
        limit 12`),
        tx.execute<{ month: string; count: number }>(sql`
        select to_char(a.applied_at at time zone ${TZ}, 'YYYY-MM') as month, count(*)::int as count
        from applications a
        where ${scope}
          and a.applied_at >= (date_trunc('month', ${localNow}) - interval '23 months') at time zone ${TZ}
        group by 1`),
        tx.execute<{
          applied: number;
          passed: number;
          interview: number;
          offer: number;
          hired: number;
        }>(sql`
        select
          count(*)::int as applied,
          count(*) filter (where a.stage not in ('applied', 'screening') or a.verdict in ('pass', 'manual_pass'))::int as passed,
          count(*) filter (where a.stage in ('interview', 'evaluation', 'offer', 'hired'))::int as interview,
          count(*) filter (where a.stage in ('offer', 'hired'))::int as offer,
          count(*) filter (where a.stage = 'hired' or a.outcome = 'hired')::int as hired
        from applications a
        where ${scope} and a.applied_at >= ${now.toISOString()}::timestamptz - interval '12 months'`),
        tx.execute<{ day: string; count: number }>(sql`
        select to_char(a.applied_at at time zone ${TZ}, 'YYYY-MM-DD') as day, count(*)::int as count
        from applications a
        where ${scope}
          and a.applied_at >= (date_trunc('day', ${localNow}) - interval '13 days') at time zone ${TZ}
        group by 1`),
        tx.execute<{ pending: number }>(sql`
        select count(*)::int as pending
        from booking_requests r
        join interview_invitations i on i.id = r.invitation_id
        join applications a on a.id = i.application_id
        where ${scope} and a.outcome = 'active' and r.status in ('pending', 'unmatched')
          and i.status in ('sent', 'opened')`),
        tx.execute<{
          interview_id: string;
          application_id: string;
          name: string;
          starts_at: string;
          ends_at: string;
          round: number;
          meeting_url: string | null;
        }>(sql`
        select iv.id as interview_id, a.id as application_id, c.name, iv.starts_at, iv.ends_at, iv.round, iv.meeting_url
        from interviews iv
        join applications a on a.id = iv.application_id
        join candidates c on c.id = a.candidate_id
        where ${scope} and iv.status = 'scheduled'
          and iv.starts_at >= date_trunc('day', ${localNow}) at time zone ${TZ}
          and iv.starts_at < (date_trunc('day', ${localNow}) + interval '1 day') at time zone ${TZ}
        order by iv.starts_at`),
      ]),
  );

  const today = japanCalendar(now);
  const monthKey = (year: number, month: number) => {
    const d = new Date(Date.UTC(year, month - 1, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  };
  const byMonth = new Map(months.map((m) => [m.month, m.count]));
  const byDay = new Map(days.map((d) => [d.day, d.count]));

  return {
    counters: {
      toReview: counters?.to_review ?? 0,
      toConfirm: counters?.to_confirm ?? 0,
      toInvite: counters?.to_invite ?? 0,
      waitingDocuments: counters?.waiting_documents ?? 0,
      pendingRequests: requests?.pending ?? 0,
    },
    today: todayRows.map((i) => ({
      interviewId: i.interview_id,
      applicationId: i.application_id,
      name: i.name,
      startsAt: new Date(i.starts_at).toISOString(),
      endsAt: new Date(i.ends_at).toISOString(),
      round: i.round,
      meetingUrl: i.meeting_url,
    })),
    boards: boards.map((b) => ({
      channel: b.channel,
      thisMonth: b.this_month,
      lastMonth: b.last_month,
    })),
    months: Array.from({ length: 12 }, (_, i) => {
      const key = monthKey(today.year, today.month - 11 + i);
      const lastYear = monthKey(today.year - 1, today.month - 11 + i);
      return { month: key, count: byMonth.get(key) ?? 0, lastYear: byMonth.get(lastYear) ?? 0 };
    }),
    funnel: (["applied", "passed", "interview", "offer", "hired"] as const).map((step) => ({
      step,
      count: funnel?.[step] ?? 0,
    })),
    days: Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.UTC(today.year, today.month - 1, today.day - 13 + i));
      const key = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      return { date: key, count: byDay.get(key) ?? 0 };
    }),
  };
}
