import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import {
  applications,
  bookingRequests,
  candidates,
  concernOptions,
  interviewInvitations,
  interviews,
  jobs,
} from "@/server/db/schema";
import type { InterviewTab } from "./tabs";

export type ActionNeeded = "pending" | "unmatched" | "unopened" | "notBooked";

export type InvitationRow = {
  invitationId: string;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  round: number;
  status: (typeof interviewInvitations.$inferSelect)["status"];
  outcome: (typeof applications.$inferSelect)["outcome"];
  sentAt: string;
  firstOpenedAt: string | null;
  bookedAt: string | null;
  followupCount: number;
  request: {
    id: string;
    status: (typeof bookingRequests.$inferSelect)["status"];
    preferred: { startsAt: string; endsAt: string }[];
    memo: string | null;
    concerns: string[];
  } | null;
  interview: {
    id: string;
    startsAt: string;
    endsAt: string;
    status: (typeof interviews.$inferSelect)["status"];
    meetingUrl: string | null;
    location: string | null;
  } | null;
  action: ActionNeeded | null;
};

const ACTION_ORDER: ActionNeeded[] = ["pending", "unmatched", "unopened", "notBooked"];
const UNOPENED_AFTER_MS = 2 * 24 * 3600_000;

/** Invitations of the client with their latest request and interview (docs/02 M7-2). */
export async function listInvitations(
  ctx: MemberCtx,
  tab: InterviewTab,
  now: Date,
): Promise<InvitationRow[]> {
  const data = await withRls(ctx, async (tx) => {
    const invitations = await tx
      .select({
        invitationId: interviewInvitations.id,
        applicationId: interviewInvitations.applicationId,
        candidateName: candidates.name,
        jobTitle: jobs.title,
        round: interviewInvitations.round,
        status: interviewInvitations.status,
        outcome: applications.outcome,
        sentAt: interviewInvitations.sentAt,
        firstOpenedAt: interviewInvitations.firstOpenedAt,
        bookedAt: interviewInvitations.bookedAt,
        followupCount: interviewInvitations.followupCount,
      })
      .from(interviewInvitations)
      .innerJoin(applications, eq(applications.id, interviewInvitations.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(interviewInvitations.orgId, ctx.orgId),
          eq(interviewInvitations.clientId, ctx.clientId),
        ),
      )
      .orderBy(desc(interviewInvitations.sentAt))
      .limit(300);
    const ids = invitations.map((i) => i.invitationId);
    if (ids.length === 0) return { invitations, requests: [], meetings: [], concerns: [] };
    const [requests, meetings, concerns] = await Promise.all([
      tx
        .select()
        .from(bookingRequests)
        .where(inArray(bookingRequests.invitationId, ids))
        .orderBy(desc(bookingRequests.createdAt)),
      tx
        .select()
        .from(interviews)
        .where(inArray(interviews.invitationId, ids))
        .orderBy(desc(interviews.createdAt)),
      tx
        .select({ id: concernOptions.id, label: concernOptions.label })
        .from(concernOptions)
        .where(eq(concernOptions.clientId, ctx.clientId))
        .orderBy(asc(concernOptions.position)),
    ]);
    return { invitations, requests, meetings, concerns };
  });

  const rows = data.invitations.map((inv): InvitationRow => {
    const request = data.requests.find((r) => r.invitationId === inv.invitationId) ?? null;
    const meeting =
      data.meetings.find((m) => m.invitationId === inv.invitationId && m.status === "scheduled") ??
      data.meetings.find((m) => m.invitationId === inv.invitationId) ??
      null;
    const open = inv.outcome === "active" && (inv.status === "sent" || inv.status === "opened");
    let action: ActionNeeded | null = null;
    if (inv.outcome === "active" && request?.status === "pending") action = "pending";
    else if (open && request?.status === "unmatched") action = "unmatched";
    else if (
      open &&
      inv.status === "sent" &&
      now.getTime() - inv.sentAt.getTime() > UNOPENED_AFTER_MS
    )
      action = "unopened";
    else if (open && inv.status === "opened") action = "notBooked";
    return {
      invitationId: inv.invitationId,
      applicationId: inv.applicationId,
      candidateName: inv.candidateName,
      jobTitle: inv.jobTitle,
      round: inv.round,
      status: inv.status,
      outcome: inv.outcome,
      sentAt: inv.sentAt.toISOString(),
      firstOpenedAt: inv.firstOpenedAt?.toISOString() ?? null,
      bookedAt: inv.bookedAt?.toISOString() ?? null,
      followupCount: inv.followupCount,
      request: request
        ? {
            id: request.id,
            status: request.status,
            preferred: request.preferred,
            memo: request.memo,
            concerns: data.concerns
              .filter((c) => request.concernIds.includes(c.id))
              .map((c) => c.label),
          }
        : null,
      interview: meeting
        ? {
            id: meeting.id,
            startsAt: meeting.startsAt.toISOString(),
            endsAt: meeting.endsAt.toISOString(),
            status: meeting.status,
            meetingUrl: meeting.meetingUrl,
            location: meeting.location,
          }
        : null,
      action,
    };
  });

  if (tab === "action") {
    return rows
      .filter((r) => r.action)
      .sort((a, b) => ACTION_ORDER.indexOf(a.action!) - ACTION_ORDER.indexOf(b.action!));
  }
  if (tab === "scheduled") {
    return rows
      .filter((r) => r.interview?.status === "scheduled")
      .sort((a, b) => a.interview!.startsAt.localeCompare(b.interview!.startsAt));
  }
  return rows;
}
