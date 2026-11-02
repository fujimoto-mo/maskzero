import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  bookFirstFree,
  durationFor,
  ensureCalendar,
  loadFreeSlots,
} from "@/features/scheduling/server";
import type { Interval } from "@/features/scheduling/slots";
import { getAdminDb } from "@/server/db/admin";
import {
  applications,
  bookingRequests,
  concernOptions,
  interviewInvitations,
  interviews,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { closeOpenScheduling } from "./server";

// The candidate's side of scheduling (docs/02 M8-3 – M8-5, M3-8). No staff session: the admin
// connection, always scoped by the application the personal-page token resolved to.

export type CandidateScope = { applicationId: string; orgId: string; clientId: string };

export type CandidateSchedule = {
  invitation: {
    id: string;
    round: number;
    status: (typeof interviewInvitations.$inferSelect)["status"];
  } | null;
  interview: {
    id: string;
    startsAt: string;
    endsAt: string;
    tool: (typeof interviews.$inferSelect)["tool"];
    meetingUrl: string | null;
    location: string | null;
    /** Last moment the candidate may reschedule; null when that has passed. */
    changeableUntil: string | null;
  } | null;
  request: "pending" | "unmatched" | null;
  outcome: (typeof applications.$inferSelect)["outcome"];
};

export async function loadCandidateSchedule(
  scope: CandidateScope,
  now: Date,
): Promise<CandidateSchedule> {
  const db = getAdminDb();
  const [[app], [invitation]] = await Promise.all([
    db
      .select({ outcome: applications.outcome })
      .from(applications)
      .where(and(eq(applications.id, scope.applicationId), eq(applications.orgId, scope.orgId))),
    db
      .select({
        id: interviewInvitations.id,
        round: interviewInvitations.round,
        status: interviewInvitations.status,
      })
      .from(interviewInvitations)
      .where(eq(interviewInvitations.applicationId, scope.applicationId))
      .orderBy(desc(interviewInvitations.round))
      .limit(1),
  ]);
  const [meeting] = await db
    .select()
    .from(interviews)
    .where(
      and(eq(interviews.applicationId, scope.applicationId), eq(interviews.status, "scheduled")),
    )
    .orderBy(asc(interviews.startsAt))
    .limit(1);
  const [request] = invitation
    ? await db
        .select({ status: bookingRequests.status })
        .from(bookingRequests)
        .where(eq(bookingRequests.invitationId, invitation.id))
        .orderBy(desc(bookingRequests.createdAt))
        .limit(1)
    : [];

  let changeableUntil: string | null = null;
  if (meeting) {
    const { rules } = await ensureCalendar(db, { orgId: scope.orgId, clientId: scope.clientId });
    const until = new Date(meeting.startsAt.getTime() - rules.cancelCutoffHours * 3600_000);
    changeableUntil = until > now ? until.toISOString() : null;
  }
  return {
    invitation: invitation ?? null,
    interview: meeting
      ? {
          id: meeting.id,
          startsAt: meeting.startsAt.toISOString(),
          endsAt: meeting.endsAt.toISOString(),
          tool: meeting.tool,
          meetingUrl: meeting.meetingUrl,
          location: meeting.location,
          changeableUntil,
        }
      : null,
    request:
      request?.status === "pending" || request?.status === "unmatched" ? request.status : null,
    outcome: app?.outcome ?? "withdrawn",
  };
}

/** First view of the booking page moves the invitation to "opened" (M7-1). */
export async function markInvitationOpened(
  scope: CandidateScope,
  invitationId: string,
): Promise<void> {
  const db = getAdminDb();
  const [opened] = await db
    .update(interviewInvitations)
    .set({
      status: "opened",
      firstOpenedAt: sql`coalesce(${interviewInvitations.firstOpenedAt}, now())`,
    })
    .where(and(eq(interviewInvitations.id, invitationId), eq(interviewInvitations.status, "sent")))
    .returning({ round: interviewInvitations.round });
  if (!opened) return;
  await recordEvent(db, {
    ...scope,
    actor: "candidate",
    type: "invitation.opened",
    payload: { invitationId, round: opened.round },
  });
}

export async function bookingOptions(scope: CandidateScope, round: number, now: Date) {
  const db = getAdminDb();
  const { calendarId, rules } = await ensureCalendar(db, {
    orgId: scope.orgId,
    clientId: scope.clientId,
  });
  const [slots, concerns] = await Promise.all([
    loadFreeSlots(db, calendarId, rules, round, now),
    db
      .select({ id: concernOptions.id, label: concernOptions.label, answer: concernOptions.answer })
      .from(concernOptions)
      .where(
        and(eq(concernOptions.orgId, scope.orgId), eq(concernOptions.clientId, scope.clientId)),
      )
      .orderBy(asc(concernOptions.position)),
  ]);
  return {
    slots,
    concerns,
    confirmMode: rules.confirmMode,
    minutes: durationFor(rules, round),
    tool: rules.tool,
  };
}

export type BookingResult =
  | { status: "confirmed"; interviewId: string; slot: Interval }
  | { status: "pending" | "unmatched" | "closed" };

/**
 * The candidate's preferred slots (up to three, in order). Automatic mode books the first one
 * still free, atomically; manual mode leaves the request for staff (M8-4).
 */
export async function submitBooking(
  scope: CandidateScope,
  input: { slots: Interval[]; concernIds: string[]; memo: string | null },
  now: Date,
): Promise<BookingResult> {
  const db = getAdminDb();
  const { calendarId, rules } = await ensureCalendar(db, {
    orgId: scope.orgId,
    clientId: scope.clientId,
  });
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select({ id: interviewInvitations.id, round: interviewInvitations.round })
      .from(interviewInvitations)
      .innerJoin(applications, eq(applications.id, interviewInvitations.applicationId))
      .where(
        and(
          eq(interviewInvitations.applicationId, scope.applicationId),
          inArray(interviewInvitations.status, ["sent", "opened"]),
          eq(applications.outcome, "active"),
        ),
      )
      .orderBy(desc(interviewInvitations.round))
      .limit(1)
      .for("update");
    if (!invitation) return { status: "closed" as const };

    // A new answer replaces an earlier unconfirmed one.
    await tx
      .update(bookingRequests)
      .set({ status: "canceled" })
      .where(
        and(
          eq(bookingRequests.invitationId, invitation.id),
          inArray(bookingRequests.status, ["pending", "unmatched"]),
        ),
      );
    // Only the client's own concern options count.
    const concerns = input.concernIds.length
      ? await tx
          .select({ id: concernOptions.id })
          .from(concernOptions)
          .where(
            and(
              eq(concernOptions.clientId, scope.clientId),
              inArray(concernOptions.id, input.concernIds),
            ),
          )
      : [];
    const [request] = await tx
      .insert(bookingRequests)
      .values({
        orgId: scope.orgId,
        clientId: scope.clientId,
        invitationId: invitation.id,
        preferred: input.slots.map((s) => ({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        })),
        concernIds: concerns.map((c) => c.id),
        memo: input.memo,
      })
      .returning({ id: bookingRequests.id });
    await recordEvent(tx, {
      ...scope,
      actor: "candidate",
      type: "booking.requested",
      payload: {
        invitationId: invitation.id,
        requestId: request!.id,
        slots: input.slots.length,
        confirmMode: rules.confirmMode,
      },
    });

    // From here the next move is the company's, unless a slot is booked right away.
    const handOver = (nextAction: "confirm_booking" | "arrange_interview") =>
      tx
        .update(applications)
        .set({ waitingOn: "staff", nextAction })
        .where(eq(applications.id, scope.applicationId));
    if (rules.confirmMode === "manual") {
      await handOver("confirm_booking");
      return { status: "pending" as const };
    }
    const booked = await bookFirstFree(tx, {
      ...scope,
      invitationId: invitation.id,
      calendarId,
      rules,
      round: invitation.round,
      preferred: input.slots,
      now,
      actor: { kind: "candidate" },
    });
    if (booked) return { status: "confirmed" as const, ...booked };
    await tx
      .update(bookingRequests)
      .set({ status: "unmatched" })
      .where(eq(bookingRequests.id, request!.id));
    await handOver("arrange_interview");
    await recordEvent(tx, {
      ...scope,
      actor: "system",
      type: "booking.unmatched",
      payload: { invitationId: invitation.id, requestId: request!.id },
    });
    return { status: "unmatched" as const };
  });
}

/**
 * The candidate reschedules (before the cutoff) or withdraws (M8-5). Returns the interviews whose
 * reminders must stop.
 */
export async function changeInterviewByCandidate(
  scope: CandidateScope,
  action: "reschedule" | "withdraw",
  now: Date,
): Promise<{ ok: true; canceled: string[] } | { ok: false; error: "notFound" | "tooLate" }> {
  const db = getAdminDb();
  const { rules } = await ensureCalendar(db, { orgId: scope.orgId, clientId: scope.clientId });
  return db.transaction(async (tx) => {
    if (action === "withdraw") {
      const [app] = await tx
        .update(applications)
        .set({
          outcome: "withdrawn",
          closeReason: "candidate_withdrew",
          waitingOn: null,
          nextAction: null,
        })
        .where(and(eq(applications.id, scope.applicationId), eq(applications.outcome, "active")))
        .returning({ id: applications.id });
      if (!app) return { ok: false as const, error: "notFound" as const };
      const canceled = await closeOpenScheduling(tx, scope.applicationId);
      await recordEvent(tx, {
        ...scope,
        actor: "candidate",
        type: "application.withdrawn",
        payload: { canceledInterviews: canceled.length },
      });
      return { ok: true as const, canceled };
    }

    const [meeting] = await tx
      .select({
        id: interviews.id,
        startsAt: interviews.startsAt,
        invitationId: interviews.invitationId,
      })
      .from(interviews)
      .where(
        and(eq(interviews.applicationId, scope.applicationId), eq(interviews.status, "scheduled")),
      )
      .for("update");
    if (!meeting) return { ok: false as const, error: "notFound" as const };
    if (meeting.startsAt.getTime() - rules.cancelCutoffHours * 3600_000 <= now.getTime()) {
      return { ok: false as const, error: "tooLate" as const };
    }
    await tx.update(interviews).set({ status: "canceled" }).where(eq(interviews.id, meeting.id));
    if (meeting.invitationId) {
      await tx
        .update(interviewInvitations)
        .set({ status: "opened", bookedAt: null })
        .where(eq(interviewInvitations.id, meeting.invitationId));
    }
    await tx
      .update(applications)
      .set({ stage: "booking", waitingOn: "candidate", nextAction: "await_booking" })
      .where(eq(applications.id, scope.applicationId));
    await recordEvent(tx, {
      ...scope,
      actor: "candidate",
      type: "interview.rescheduled",
      payload: { interviewId: meeting.id },
    });
    return { ok: true as const, canceled: [meeting.id] };
  });
}
