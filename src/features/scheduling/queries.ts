import "server-only";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { getAdminDb } from "@/server/db/admin";
import { withRls } from "@/server/db/rls";
import { concernOptions, interviews } from "@/server/db/schema";
import { ensureCalendar, overridesBetween, type RulesRow } from "./server";
import {
  addDays,
  hoursOn,
  holidayName,
  jstDateKey,
  jstInstant,
  jstTime,
  ruleSlotsOn,
  weekdayOf,
} from "./slots";

export type SlotState = "open" | "closed" | "booked";
export type CalendarDay = {
  date: string;
  weekday: number;
  holiday: string | null;
  /** Hours from the rules, or null when the rules close the day. */
  hours: { from: string; to: string } | null;
  slots: { startsAt: string; time: string; state: SlotState; manual: boolean }[];
  booked: number;
  /** Before today in Japan: shown for its bookings, no longer editable. */
  past: boolean;
};

/** Hourly starts offered on the calendar for opening extra slots (the reference shows 08:00–22:00). */
const EXTRA_HOURS = Array.from({ length: 14 }, (_, i) => `${String(8 + i).padStart(2, "0")}:00`);

export type SchedulingSetup = {
  calendarId: string;
  rules: RulesRow;
  month: string;
  days: CalendarDay[];
  concerns: { id: string; label: string; answer: string }[];
};

/** The client's availability rules, one month of the calendar, and the concern options. */
export async function getSchedulingSetup(
  ctx: MemberCtx,
  month: string,
  now: Date,
): Promise<SchedulingSetup> {
  const today = jstDateKey(now);
  // Creating the shared calendar on first view is bookkeeping, scoped to the member's own client.
  const { calendarId, rules } = await ensureCalendar(getAdminDb(), {
    orgId: ctx.orgId,
    clientId: ctx.clientId,
  });
  const first = `${month}-01`;
  const next = addDays(first, 40).slice(0, 7) + "-01";
  const from = jstInstant(first, "00:00");
  const to = jstInstant(next, "00:00");

  const { overrides, booked, concerns } = await withRls(ctx, async (tx) => {
    const [overrides, booked, concerns] = await Promise.all([
      overridesBetween(tx, calendarId, from, to),
      tx
        .select({ startsAt: interviews.startsAt, endsAt: interviews.endsAt })
        .from(interviews)
        .where(
          and(
            eq(interviews.calendarId, calendarId),
            eq(interviews.status, "scheduled"),
            gte(interviews.startsAt, from),
            lt(interviews.startsAt, to),
          ),
        ),
      tx
        .select({
          id: concernOptions.id,
          label: concernOptions.label,
          answer: concernOptions.answer,
        })
        .from(concernOptions)
        .where(and(eq(concernOptions.orgId, ctx.orgId), eq(concernOptions.clientId, ctx.clientId)))
        .orderBy(asc(concernOptions.position)),
    ]);
    return { overrides, booked, concerns };
  });

  const engine = {
    weekly: rules.weekly,
    commonFrom: rules.commonFrom,
    commonTo: rules.commonTo,
    slotMinutes: rules.slotMinutes,
    bufferMinutes: rules.bufferMinutes,
    excludeWeekends: rules.excludeWeekends,
    excludeHolidays: rules.excludeHolidays,
    windowDays: rules.windowDays,
    minNoticeHours: rules.minNoticeHours,
  };
  const overrideAt = new Map(overrides.map((o) => [o.startsAt.getTime(), o.open]));
  const days: CalendarDay[] = [];
  for (let date = first; date < next; date = addDays(date, 1)) {
    const ruleStarts = new Set(ruleSlotsOn(engine, date).map((s) => s.startsAt.getTime()));
    const starts = new Set([
      ...ruleStarts,
      ...EXTRA_HOURS.map((h) => jstInstant(date, h).getTime()),
    ]);
    for (const at of overrideAt.keys()) if (jstDateKey(new Date(at)) === date) starts.add(at);
    const dayBooked = booked.filter((b) => jstDateKey(b.startsAt) === date);
    days.push({
      date,
      weekday: weekdayOf(date),
      holiday: holidayName(date),
      hours: hoursOn(engine, date),
      booked: dayBooked.length,
      past: date < today,
      slots: [...starts]
        .sort((a, b) => a - b)
        .map((at) => {
          const startsAt = new Date(at);
          const override = overrideAt.get(at);
          const isBooked = dayBooked.some(
            (b) => b.startsAt.getTime() <= at && at < b.endsAt.getTime(),
          );
          const open = override ?? ruleStarts.has(at);
          return {
            startsAt: startsAt.toISOString(),
            time: jstTime(startsAt),
            state: isBooked ? "booked" : open ? "open" : "closed",
            manual: override !== undefined,
          };
        }),
    });
  }
  return { calendarId, rules, month, days, concerns };
}
