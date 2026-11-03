// Analytics (docs/02 M10), pure. Input: one row per application that applied in the period, with
// the first time it reached each step (from the events table). Every figure is a cohort figure:
// of the people who applied in the period, how many got how far, and how fast.

export const STEPS = [
  "entered",
  "passed",
  "opened",
  "scheduled",
  "held",
  "offer",
  "hired",
] as const;
export type Step = (typeof STEPS)[number];

export type AppSteps = { channel: string } & Record<Step, Date | null>;

/** Reaching a later step counts as passing the earlier ones (a booking without a page view, say). */
export function reached(row: AppSteps, step: Step): boolean {
  return STEPS.slice(STEPS.indexOf(step)).some((s) => row[s] !== null);
}

export type FunnelStep = { step: Step; count: number; rate: number | null };

/** Count per step and the conversion from the previous step (M10-2). */
export function funnel(rows: AppSteps[]): FunnelStep[] {
  return STEPS.map((step, i) => {
    const count = rows.filter((r) => reached(r, step)).length;
    const prev = i === 0 ? null : rows.filter((r) => reached(r, STEPS[i - 1]!)).length;
    return { step, count, rate: prev ? count / prev : null };
  });
}

/** The step with the lowest conversion, among those with at least `minBase` people before it. */
export function worstStep(steps: FunnelStep[], minBase = 5): Exclude<Step, "entered"> | null {
  let worst: FunnelStep | null = null;
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.rate === null || steps[i - 1]!.count < minBase) continue;
    if (!worst || step.rate < worst.rate!) worst = step;
  }
  // The first step has no rate, so it is never the worst.
  return (worst?.step as Exclude<Step, "entered"> | undefined) ?? null;
}

const DAY_MS = 24 * 3600_000;
const HOUR_MS = 3600_000;

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Average days between consecutive steps, for people who reached both (M10-5). */
export function averageDays(rows: AppSteps[]): { from: Step; to: Step; days: number | null }[] {
  return STEPS.slice(1).map((to, i) => {
    const from = STEPS[i]!;
    const gaps = rows.flatMap((r) => {
      const a = r[from];
      const b = r[to];
      return a && b && b >= a ? [(b.getTime() - a.getTime()) / DAY_MS] : [];
    });
    return { from, to, days: mean(gaps) };
  });
}

export const LAG_BUCKETS = ["hour", "day", "threeDays", "later", "never"] as const;
export type LagBucket = (typeof LAG_BUCKETS)[number];

function lagBucket(sent: Date, opened: Date | null): LagBucket {
  if (!opened) return "never";
  const lag = opened.getTime() - sent.getTime();
  if (lag <= HOUR_MS) return "hour";
  if (lag <= DAY_MS) return "day";
  if (lag <= 3 * DAY_MS) return "threeDays";
  return "later";
}

/**
 * How soon invited people opened the booking page, and how many of each group got an interview
 * (M10-3): a slow response usually means fewer interviews.
 */
export function responseLag(
  rows: AppSteps[],
): { bucket: LagBucket; count: number; interviewRate: number | null }[] {
  const invited = rows.filter((r) => r.passed);
  return LAG_BUCKETS.map((bucket) => {
    const group = invited.filter((r) => lagBucket(r.passed!, r.opened) === bucket);
    const interviews = group.filter((r) => reached(r, "scheduled")).length;
    return {
      bucket,
      count: group.length,
      interviewRate: group.length ? interviews / group.length : null,
    };
  });
}

/** Median hours from opening the booking page to having an interview set (M10-3). */
export function openToBookingHours(rows: AppSteps[]): number | null {
  return median(
    rows.flatMap((r) =>
      r.opened && r.scheduled && r.scheduled >= r.opened
        ? [(r.scheduled.getTime() - r.opened.getTime()) / HOUR_MS]
        : [],
    ),
  );
}

export type BoardRow = {
  channel: string;
  volume: number;
  passRate: number;
  /** Average days from applying to the pass and invitation: how fast the company answers. */
  daysToRespond: number | null;
  interviewRate: number;
};

/** Per job board (M10-4), busiest first. */
export function byBoard(rows: AppSteps[]): BoardRow[] {
  const groups = new Map<string, AppSteps[]>();
  for (const r of rows) groups.set(r.channel, [...(groups.get(r.channel) ?? []), r]);
  return [...groups.entries()]
    .map(([channel, group]) => ({
      channel,
      volume: group.length,
      passRate: group.filter((r) => reached(r, "passed")).length / group.length,
      daysToRespond: mean(
        group.flatMap((r) =>
          r.entered && r.passed ? [(r.passed.getTime() - r.entered.getTime()) / DAY_MS] : [],
        ),
      ),
      interviewRate: group.filter((r) => reached(r, "scheduled")).length / group.length,
    }))
    .sort((a, b) => b.volume - a.volume);
}

/** Share of invitations opened, by the hour (Japan time) they were sent (M10-5). */
export function openRateByHour(
  rows: AppSteps[],
): { hour: number; sent: number; opened: number; rate: number }[] {
  const hours = new Map<number, { sent: number; opened: number }>();
  for (const r of rows) {
    if (!r.passed) continue;
    const hour = new Date(r.passed.getTime() + 9 * HOUR_MS).getUTCHours();
    const h = hours.get(hour) ?? { sent: 0, opened: 0 };
    h.sent++;
    if (r.opened) h.opened++;
    hours.set(hour, h);
  }
  return [...hours.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, h]) => ({ hour, ...h, rate: h.opened / h.sent }));
}

export type Period = { key: "m" | "p" | "q" | "c"; from: string; to: string };

/** "YYYY-MM-DD" bounds in Japan time; `to` is exclusive. Custom ranges are capped at a year. */
export function periodFor(
  key: string | undefined,
  now: Date,
  custom?: { from?: string; to?: string },
): Period {
  const local = new Date(now.getTime() + 9 * HOUR_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const day = (yy: number, mm: number, dd = 1) =>
    new Date(Date.UTC(yy, mm, dd)).toISOString().slice(0, 10);
  const today = local.toISOString().slice(0, 10);
  const tomorrow = day(y, m, local.getUTCDate() + 1);
  const valid = (s?: string) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (key === "c" && valid(custom?.from) && valid(custom?.to) && custom!.from! <= custom!.to!) {
    const toExclusive = new Date(Date.parse(`${custom!.to!}T00:00:00Z`) + DAY_MS)
      .toISOString()
      .slice(0, 10);
    const yearBefore = new Date(Date.parse(`${toExclusive}T00:00:00Z`) - 366 * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return {
      key: "c",
      from: custom!.from! < yearBefore ? yearBefore : custom!.from!,
      to: toExclusive,
    };
  }
  if (key === "p") return { key: "p", from: day(y, m - 1), to: day(y, m) };
  if (key === "q")
    return { key: "q", from: day(y, m - 2), to: today < tomorrow ? tomorrow : today };
  return { key: "m", from: day(y, m), to: tomorrow };
}
