"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ensureCalendar, bookFirstFree } from "@/features/scheduling/server";
import { type MemberCtx, requireEditor } from "@/server/auth/session";
import { getAdminDb } from "@/server/db/admin";
import { withRls } from "@/server/db/rls";
import {
  applications,
  bookingRequests,
  interviewInvitations,
  interviews,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import {
  interviewChanged,
  interviewFinished,
  interviewScheduled,
  invitationResend,
} from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { bookingUrl, portalTokenFor } from "@/server/portal";

const path = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

async function ownInvitation(ctx: MemberCtx, invitationId: string) {
  return withRls(ctx, async (tx) => {
    const [row] = await tx
      .select({
        applicationId: interviewInvitations.applicationId,
        round: interviewInvitations.round,
      })
      .from(interviewInvitations)
      .where(
        and(
          eq(interviewInvitations.id, invitationId),
          eq(interviewInvitations.orgId, ctx.orgId),
          eq(interviewInvitations.clientId, ctx.clientId),
        ),
      );
    return row ?? null;
  });
}

/** The candidate's booking page link, to paste into a job board's messaging (M7-2). */
export async function bookingLinkAction(
  orgSlug: string,
  clientSlug: string,
  invitationId: string,
): Promise<{ ok: true; url: string } | { ok: false }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const invitation = await ownInvitation(ctx, z.uuid().parse(invitationId));
  if (!invitation) return { ok: false };
  const token = await withRls(ctx, (tx) => portalTokenFor(tx, invitation.applicationId));
  return { ok: true, url: bookingUrl(token) };
}

/**
 * Emails the invitation again (M7-2). A request whose slots were all taken is closed, so the
 * candidate picks again.
 */
export async function resendInvitationAction(
  orgSlug: string,
  clientSlug: string,
  invitationId: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const invitation = await ownInvitation(ctx, z.uuid().parse(invitationId));
  if (!invitation) return { ok: false };
  await withRls(ctx, async (tx) => {
    const closed = await tx
      .update(bookingRequests)
      .set({ status: "canceled" })
      .where(
        and(
          eq(bookingRequests.invitationId, invitationId),
          eq(bookingRequests.status, "unmatched"),
        ),
      )
      .returning({ id: bookingRequests.id });
    if (closed.length > 0) {
      await tx
        .update(applications)
        .set({ waitingOn: "candidate", nextAction: "await_booking" })
        .where(
          and(eq(applications.id, invitation.applicationId), eq(applications.outcome, "active")),
        );
    }
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId: invitation.applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: "invitation.resent",
      payload: { invitationId, round: invitation.round },
    });
  });
  await sendEventBestEffort(
    invitationResend.create({
      invitationId,
      orgId: ctx.orgId,
      requestedAt: new Date().toISOString(),
    }),
  );
  revalidatePath(path(ctx), "layout");
  return { ok: true };
}

/**
 * Confirms one of the candidate's preferred slots by hand: manual confirmation mode, or a request
 * that found no free slot automatically (M8-4). The exclusion constraint still guards overlaps.
 */
export async function confirmRequestAction(
  orgSlug: string,
  clientSlug: string,
  requestId: string,
  slotIndex: number,
): Promise<{ ok: true } | { ok: false; error: "notFound" | "taken" }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  z.uuid().parse(requestId);
  const { calendarId, rules } = await ensureCalendar(getAdminDb(), {
    orgId: ctx.orgId,
    clientId: ctx.clientId,
  });
  const now = new Date();
  const result = await withRls(ctx, async (tx) => {
    const [request] = await tx
      .select({
        preferred: bookingRequests.preferred,
        invitationId: bookingRequests.invitationId,
        applicationId: interviewInvitations.applicationId,
        round: interviewInvitations.round,
      })
      .from(bookingRequests)
      .innerJoin(interviewInvitations, eq(interviewInvitations.id, bookingRequests.invitationId))
      .where(
        and(
          eq(bookingRequests.id, requestId),
          eq(bookingRequests.orgId, ctx.orgId),
          eq(bookingRequests.clientId, ctx.clientId),
          inArray(bookingRequests.status, ["pending", "unmatched"]),
        ),
      );
    const slot = request?.preferred[slotIndex];
    if (!request || !slot) return { error: "notFound" as const };
    const booked = await bookFirstFree(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId: request.applicationId,
      invitationId: request.invitationId,
      calendarId,
      rules,
      round: request.round,
      preferred: [{ startsAt: new Date(slot.startsAt), endsAt: new Date(slot.endsAt) }],
      now,
      actor: { kind: "staff", userId: ctx.userId },
    });
    if (!booked) return { error: "taken" as const };
    await tx
      .update(bookingRequests)
      .set({ status: "confirmed" })
      .where(eq(bookingRequests.id, requestId));
    return { interviewId: booked.interviewId };
  });
  if (result.error || !result.interviewId) return { ok: false, error: result.error ?? "taken" };
  await sendEventBestEffort(
    interviewScheduled.create({ interviewId: result.interviewId, orgId: ctx.orgId }),
  );
  revalidatePath(path(ctx), "layout");
  return { ok: true };
}

/**
 * After the interview: done, no-show or canceled (M8-5). A no-show or cancellation reopens the
 * invitation so the candidate can book again, and stops the pending reminder.
 */
export async function markInterviewAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  status: "done" | "no_show" | "canceled",
): Promise<{ ok: boolean }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  z.uuid().parse(interviewId);
  const changed = await withRls(ctx, async (tx) => {
    const [interview] = await tx
      .update(interviews)
      .set({ status })
      .where(
        and(
          eq(interviews.id, interviewId),
          eq(interviews.orgId, ctx.orgId),
          eq(interviews.clientId, ctx.clientId),
          eq(interviews.status, "scheduled"),
        ),
      )
      .returning({
        applicationId: interviews.applicationId,
        invitationId: interviews.invitationId,
      });
    if (!interview) return false;
    if (status === "done") {
      await tx
        .update(applications)
        .set({ stage: "evaluation", waitingOn: "staff", nextAction: "decide_after_interview" })
        .where(eq(applications.id, interview.applicationId));
    } else {
      if (interview.invitationId) {
        await tx
          .update(interviewInvitations)
          .set({ status: "opened", bookedAt: null })
          .where(eq(interviewInvitations.id, interview.invitationId));
      }
      await tx
        .update(applications)
        .set({ stage: "booking", waitingOn: "candidate", nextAction: "await_booking" })
        .where(eq(applications.id, interview.applicationId));
    }
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId: interview.applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: `interview.${status}`,
      payload: { interviewId },
    });
    return true;
  });
  if (!changed) return { ok: false };
  if (status !== "done") {
    await sendEventBestEffort(interviewChanged.create({ interviewId, orgId: ctx.orgId }));
  }
  if (status === "done" || status === "no_show") {
    await sendEventBestEffort(
      interviewFinished.create({ interviewId, orgId: ctx.orgId, outcome: status }),
    );
  }
  revalidatePath(path(ctx), "layout");
  return { ok: true };
}
