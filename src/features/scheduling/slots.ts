import holidayJp from "@holiday-jp/holiday_jp";

// Slot math in Japan time (docs/05 §9). Japan has no daylight saving time, so a Japan date and
// "HH:MM" map to one instant with a fixed +09:00 offset. Pure and deterministic: the caller passes
// `now`, the rules, the manual overrides and the busy intervals.

const JST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 24 * 3600_000;

export type DayHours = { on: boolean; from: string; to: string };

export type AvailabilityRules = {
  /** Hours per weekday, keyed "0" (Sunday) … "6"; a day without an entry uses the common hours. */
  weekly: Partial<Record<string, DayHours>>;
  commonFrom: string;
  commonTo: string;
  slotMinutes: number;
  bufferMinutes: number;
  excludeWeekends: boolean;
  excludeHolidays: boolean;
  windowDays: number;
  minNoticeHours: number;
};

export type Interval = { startsAt: Date; endsAt: Date };
export type SlotOverride = { startsAt: Date; open: boolean };

/** "YYYY-MM-DD" of the Japan date an instant falls on. */
export function jstDateKey(at: Date): string {
  return new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant of "HH:MM" on a Japan date. */
export function jstInstant(dateKey: string, hhmm: string): Date {
  return new Date(`${dateKey}T${hhmm}:00+09:00`);
}

export function addDays(dateKey: string, days: number): string {
  return new Date(new Date(`${dateKey}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday, for a Japan date. */
export const weekdayOf = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`).getUTCDay();

export const isJapaneseHoliday = (dateKey: string) => dateKey in holidayJp.holidays;

export const holidayName = (dateKey: string): string | null =>
  (holidayJp.holidays as Record<string, { name: string }>)[dateKey]?.name ?? null;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The open hours of one Japan date under the rules, or null when the day is closed. */
export function hoursOn(
  rules: AvailabilityRules,
  dateKey: string,
): { from: string; to: string } | null {
  const weekday = weekdayOf(dateKey);
  if (rules.excludeWeekends && (weekday === 0 || weekday === 6)) return null;
  if (rules.excludeHolidays && isJapaneseHoliday(dateKey)) return null;
  const day = rules.weekly[String(weekday)];
  if (day && !day.on) return null;
  const from = day?.from ?? rules.commonFrom;
  const to = day?.to ?? rules.commonTo;
  return minutesOf(to) > minutesOf(from) ? { from, to } : null;
}

/**
 * The rule grid of one Japan date: starts every slot + buffer minutes from the opening time, each
 * slot `durationMinutes` long and ending by the closing time.
 */
export function ruleSlotsOn(
  rules: AvailabilityRules,
  dateKey: string,
  durationMinutes = rules.slotMinutes,
): Interval[] {
  const hours = hoursOn(rules, dateKey);
  if (!hours) return [];
  const step = (rules.slotMinutes + rules.bufferMinutes) * 60_000;
  const close = jstInstant(dateKey, hours.to).getTime();
  const slots: Interval[] = [];
  for (
    let start = jstInstant(dateKey, hours.from).getTime();
    start + durationMinutes * 60_000 <= close;
    start += step
  ) {
    slots.push({ startsAt: new Date(start), endsAt: new Date(start + durationMinutes * 60_000) });
  }
  return slots;
}

/** The last instant a slot may start: the end of the Japan date `windowDays` after today. */
export function windowEnd(rules: AvailabilityRules, now: Date): Date {
  return jstInstant(addDays(jstDateKey(now), rules.windowDays + 1), "00:00");
}

/**
 * Free slots (docs/05 §9): the rule grid over the booking window, plus slots opened by hand, minus
 * slots closed by hand, minus anything overlapping a busy interval (with the buffer around it), and
 * nothing earlier than the minimum notice.
 */
export function freeSlots(input: {
  rules: AvailabilityRules;
  overrides: SlotOverride[];
  busy: Interval[];
  now: Date;
  /** Interview length; later rounds can be longer than the grid step. */
  durationMinutes?: number;
}): Interval[] {
  const { rules, overrides, busy, now } = input;
  const duration = (input.durationMinutes ?? rules.slotMinutes) * 60_000;
  const earliest = now.getTime() + rules.minNoticeHours * 3600_000;
  const latest = windowEnd(rules, now).getTime();
  const buffer = rules.bufferMinutes * 60_000;

  const byStart = new Map<number, Interval>();
  const today = jstDateKey(now);
  for (let day = 0; day <= rules.windowDays; day++) {
    for (const slot of ruleSlotsOn(rules, addDays(today, day), input.durationMinutes)) {
      byStart.set(slot.startsAt.getTime(), slot);
    }
  }
  for (const override of overrides) {
    const start = override.startsAt.getTime();
    if (override.open)
      byStart.set(start, { startsAt: override.startsAt, endsAt: new Date(start + duration) });
    else byStart.delete(start);
  }

  return [...byStart.values()]
    .filter((slot) => slot.startsAt.getTime() >= earliest && slot.startsAt.getTime() < latest)
    .filter(
      (slot) =>
        !busy.some(
          (b) =>
            slot.startsAt.getTime() < b.endsAt.getTime() + buffer &&
            slot.endsAt.getTime() + buffer > b.startsAt.getTime(),
        ),
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Whether a slot the candidate picked is still among the free ones (same start and length). */
export function isFree(slot: Interval, free: Interval[]): boolean {
  return free.some(
    (f) =>
      f.startsAt.getTime() === slot.startsAt.getTime() &&
      f.endsAt.getTime() === slot.endsAt.getTime(),
  );
}

// -------------------------------------------------------------------------------------------------
// Send times (docs/02 M9-3, M9-6)
// -------------------------------------------------------------------------------------------------

/** Quiet hours are 21:00–08:00 in Japan: a send due then waits until 08:00. */
export function outsideQuietHours(at: Date): Date {
  const local = new Date(at.getTime() + JST_OFFSET_MS);
  const hour = local.getUTCHours();
  if (hour >= 8 && hour < 21) return at;
  const dateKey = jstDateKey(at);
  return jstInstant(hour >= 21 ? addDays(dateKey, 1) : dateKey, "08:00");
}

/** The day-before reminder: 18:00 Japan time on the previous day, or null if that has passed. */
export function reminderAt(interviewStart: Date, now: Date): Date | null {
  const at = jstInstant(addDays(jstDateKey(interviewStart), -1), "18:00");
  return at.getTime() > now.getTime() ? at : null;
}

/** 10:00 Japan time `days` days after `from` (follow-ups, rejection notices). */
export function morningAfter(from: Date, days: number): Date {
  return jstInstant(addDays(jstDateKey(from), days), "10:00");
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "HH:MM" of an instant in Japan time. */
export const jstTime = (at: Date) =>
  new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(11, 16);

/** "11月4日（水）14:00〜15:00" in Japan time, for emails and pages. */
export function formatSlot(slot: Interval): string {
  const start = new Date(slot.startsAt.getTime() + JST_OFFSET_MS);
  return `${start.getUTCMonth() + 1}月${start.getUTCDate()}日（${WEEKDAYS[start.getUTCDay()]}）${jstTime(slot.startsAt)}〜${jstTime(slot.endsAt)}`;
}

/** Free slots grouped by Japan date, for the booking page. */
export function slotDays(slots: Interval[]) {
  const days = new Map<
    string,
    { date: string; label: string; slots: { startsAt: string; endsAt: string; time: string }[] }
  >();
  for (const slot of slots) {
    const date = jstDateKey(slot.startsAt);
    const local = new Date(slot.startsAt.getTime() + JST_OFFSET_MS);
    const day = days.get(date) ?? {
      date,
      label: `${local.getUTCMonth() + 1}月${local.getUTCDate()}日（${WEEKDAYS[local.getUTCDay()]}）`,
      slots: [],
    };
    day.slots.push({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      time: jstTime(slot.startsAt),
    });
    days.set(date, day);
  }
  return [...days.values()];
}
