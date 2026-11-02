import "server-only";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { Db, Tx } from "@/server/db/client";
import {
  applications,
  availabilityRules,
  bookingRequests,
  calendars,
  interviewInvitations,
  interviews,
  slotOverrides,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { type AvailabilityRules, freeSlots, type Interval, isFree, windowEnd } from "./slots";

// Server side of scheduling: calendars, rules, free slots and confirmation. Callers pass the
// connection: withRls() transactions for staff, the admin connection for candidate pages and jobs.

type Conn = Db | Tx;
type Scope = { orgId: string; clientId: string };

export type RulesRow = typeof availabilityRules.$inferSelect;

export const toEngineRules = (row: RulesRow): AvailabilityRules => ({
  weekly: row.weekly,
  commonFrom: row.commonFrom,
  commonTo: row.commonTo,
  slotMinutes: row.slotMinutes,
  bufferMinutes: row.bufferMinutes,
  excludeWeekends: row.excludeWeekends,
  excludeHolidays: row.excludeHolidays,
  windowDays: row.windowDays,
  minNoticeHours: row.minNoticeHours,
});

/** The client's shared calendar and its rules, created with the defaults on first use. */
export async function ensureCalendar(
  conn: Conn,
  scope: Scope,
): Promise<{ calendarId: string; rules: RulesRow }> {
  const [existing] = await conn
    .select({ calendarId: calendars.id })
    .from(calendars)
    .where(and(eq(calendars.clientId, scope.clientId), isNull(calendars.ownerUserId)));
  let calendarId = existing?.calendarId;
  if (!calendarId) {
    const [created] = await conn
      .insert(calendars)
      .values({ ...scope, name: "面接" })
      .onConflictDoNothing()
      .returning({ id: calendars.id });
    calendarId =
      created?.id ??
      (
        await conn
          .select({ id: calendars.id })
          .from(calendars)
          .where(and(eq(calendars.clientId, scope.clientId), isNull(calendars.ownerUserId)))
      )[0]!.id;
  }
  await conn
    .insert(availabilityRules)
    .values({ calendarId, ...scope })
    .onConflictDoNothing();
  const [rules] = await conn
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.calendarId, calendarId));
  return { calendarId, rules: rules! };
}

/** Scheduled interviews of a calendar overlapping [from, to). */
export async function busyIntervals(
  conn: Conn,
  calendarId: string,
  from: Date,
  to: Date,
): Promise<Interval[]> {
  return conn
    .select({ startsAt: interviews.startsAt, endsAt: interviews.endsAt })
    .from(interviews)
    .where(
      and(
        eq(interviews.calendarId, calendarId),
        eq(interviews.status, "scheduled"),
        lt(interviews.startsAt, to),
        gte(interviews.endsAt, from),
      ),
    );
}

export async function overridesBetween(conn: Conn, calendarId: string, from: Date, to: Date) {
  return conn
    .select({ startsAt: slotOverrides.startsAt, open: slotOverrides.open })
    .from(slotOverrides)
    .where(
      and(
        eq(slotOverrides.calendarId, calendarId),
        gte(slotOverrides.startsAt, from),
        lt(slotOverrides.startsAt, to),
      ),
    )
    .orderBy(asc(slotOverrides.startsAt));
}

export const durationFor = (rules: RulesRow, round: number) =>
  round > 1 ? rules.laterRoundMinutes : rules.slotMinutes;

/** Free slots of a calendar for an interview of the given round (docs/05 §9). */
export async function loadFreeSlots(
  conn: Conn,
  calendarId: string,
  rules: RulesRow,
  round: number,
  now: Date,
): Promise<Interval[]> {
  const end = windowEnd(toEngineRules(rules), now);
  const [overrides, busy] = await Promise.all([
    overridesBetween(conn, calendarId, now, end),
    busyIntervals(conn, calendarId, now, end),
  ]);
  return freeSlots({
    rules: toEngineRules(rules),
    overrides,
    busy,
    now,
    durationMinutes: durationFor(rules, round),
  });
}

// A concurrent booking of the same time: the exclusion constraint's rejection, or the deadlock
// two simultaneous inserts can run into while checking it.
const BOOKING_CONFLICTS = new Set(["23P01", "40P01"]);

function isOverlapError(error: unknown): boolean {
  const code =
    (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;
  return code !== undefined && BOOKING_CONFLICTS.has(code);
}

export type Confirmation = { interviewId: string; slot: Interval };

/**
 * Books the first preferred slot that is still free (M8-4), inside the caller's transaction.
 * Bookings on one calendar take turns (a transaction-level advisory lock), so the free-slot check
 * sees every booking committed before it. The exclusion constraint stays the last line: each
 * attempt runs in a savepoint, and a rejected insert moves on to the next preference. Returns null
 * when none fits.
 */
export async function bookFirstFree(
  tx: Tx,
  input: Scope & {
    applicationId: string;
    invitationId: string;
    calendarId: string;
    rules: RulesRow;
    round: number;
    preferred: Interval[];
    now: Date;
    actor: { kind: "candidate" | "system" | "staff"; userId?: string | null };
  },
): Promise<Confirmation | null> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`interviews:${input.calendarId}`}, 0))`,
  );
  const free = await loadFreeSlots(tx, input.calendarId, input.rules, input.round, input.now);
  for (const slot of input.preferred) {
    if (!isFree(slot, free)) continue;
    try {
      const interviewId = await tx.transaction(async (savepoint) => {
        const [row] = await savepoint
          .insert(interviews)
          .values({
            orgId: input.orgId,
            clientId: input.clientId,
            applicationId: input.applicationId,
            invitationId: input.invitationId,
            calendarId: input.calendarId,
            round: input.round,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            tool: input.rules.tool,
            meetingUrl: input.rules.tool === "url" ? input.rules.fixedMeetingUrl : null,
            location: input.rules.tool === "onsite" ? input.rules.onsiteAddress : null,
          })
          .returning({ id: interviews.id });
        return row!.id;
      });
      await markScheduled(tx, { ...input, interviewId, slot });
      return { interviewId, slot };
    } catch (error) {
      if (!isOverlapError(error)) throw error;
    }
  }
  return null;
}

/** After an interview is booked: invitation booked, application scheduled, event recorded. */
async function markScheduled(
  tx: Tx,
  input: Scope & {
    applicationId: string;
    invitationId: string;
    interviewId: string;
    slot: Interval;
    round: number;
    actor: { kind: "candidate" | "system" | "staff"; userId?: string | null };
  },
): Promise<void> {
  await tx
    .update(interviewInvitations)
    .set({ status: "booked", bookedAt: sql`now()` })
    .where(eq(interviewInvitations.id, input.invitationId));
  await tx
    .update(bookingRequests)
    .set({ status: "confirmed" })
    .where(
      and(
        eq(bookingRequests.invitationId, input.invitationId),
        eq(bookingRequests.status, "pending"),
      ),
    );
  await tx
    .update(applications)
    .set({ stage: "scheduled", waitingOn: null, nextAction: null })
    .where(eq(applications.id, input.applicationId));
  await recordEvent(tx, {
    orgId: input.orgId,
    clientId: input.clientId,
    applicationId: input.applicationId,
    actor: input.actor.kind,
    actorId: input.actor.userId ?? null,
    type: "interview.scheduled",
    payload: {
      interviewId: input.interviewId,
      round: input.round,
      startsAt: input.slot.startsAt.toISOString(),
    },
  });
}
