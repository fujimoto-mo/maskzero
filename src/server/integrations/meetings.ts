import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { postingFieldsSchema } from "@/features/jobs/schema";
import { formatSlot } from "@/features/scheduling/slots";
import { getPublicEnv } from "@/lib/env";
import { deriveKey } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import {
  applications,
  calendars,
  candidates,
  clients,
  type ExternalIds,
  integrations,
  interviews,
  jobs,
  organizations,
} from "@/server/db/schema";
import { grants, integrationsFake, meetingBotAvailable, type Provider } from "./config";
import { IntegrationError } from "./oauth";
import {
  createBot,
  createGoogleEvent,
  createTeamsMeeting,
  createZoomMeeting,
  deleteGoogleEvent,
  deleteTeamsMeeting,
  deleteZoomMeeting,
  type MeetingInput,
  removeBot,
} from "./providers";

// What a booked interview needs outside mask0 (docs/02 M8-6, M11-5): the Google Calendar event,
// the Zoom or Teams meeting, the Meet link, and the meeting bot. Each id is saved as soon as it
// exists, so a retry continues where the last attempt stopped and a cancellation removes it all.

export const ONLINE_TOOLS = ["url", "meet", "zoom", "teams"] as const;
/** Tools whose link is created per interview through a connected account. */
export const GENERATED_TOOLS = { meet: "google", zoom: "zoom", teams: "microsoft" } as const;

async function loadInterview(interviewId: string, orgId: string) {
  const [row] = await getAdminDb()
    .select({
      id: interviews.id,
      status: interviews.status,
      tool: interviews.tool,
      round: interviews.round,
      startsAt: interviews.startsAt,
      endsAt: interviews.endsAt,
      meetingUrl: interviews.meetingUrl,
      location: interviews.location,
      externalIds: interviews.externalIds,
      recordingAllowed: interviews.recordingAllowed,
      applicationId: interviews.applicationId,
      googleCalendarId: calendars.googleCalendarId,
      candidateName: candidates.name,
      postingFields: jobs.postingFields,
      jobTitle: jobs.title,
      clientName: clients.name,
      clientSlug: clients.slug,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      recordsInterviews: organizations.recordsInterviews,
      botName: organizations.botName,
    })
    .from(interviews)
    .innerJoin(calendars, eq(calendars.id, interviews.calendarId))
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(clients, eq(clients.id, interviews.clientId))
    .innerJoin(organizations, eq(organizations.id, interviews.orgId))
    .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)));
  return row ?? null;
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadInterview>>>;

/** The connected providers of a company and what each was granted. */
async function connections(orgId: string): Promise<Map<Provider, string[]>> {
  const rows = await getAdminDb()
    .select({ provider: integrations.provider, scopes: integrations.scopes })
    .from(integrations)
    .where(and(eq(integrations.orgId, orgId), eq(integrations.status, "active")));
  return new Map(rows.map((r) => [r.provider, r.scopes]));
}

function meetingInput(row: Loaded): MeetingInput {
  const job = postingFieldsSchema.catch({}).parse(row.postingFields).title ?? row.jobTitle;
  return {
    key: row.id,
    // The company's own calendar: the candidate's name helps the interviewers find it.
    title: `面接：${row.candidateName}さん（${job}・${row.round}次）`,
    description: [
      `${row.clientName}`,
      formatSlot(row),
      // The interview workspace, for the interviewers.
      `${getPublicEnv().appUrl}/app/${row.orgSlug}/${row.clientSlug}/meetings/${row.id}`,
    ].join("\n"),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    location: row.tool === "onsite" ? row.location : row.meetingUrl,
  };
}

async function save(
  interviewId: string,
  values: { externalIds: ExternalIds; meetingUrl?: string | null },
) {
  await getAdminDb().update(interviews).set(values).where(eq(interviews.id, interviewId));
}

export type MeetingOutcome =
  | { status: "ready"; meetingUrl: string | null }
  | { status: "skipped"; reason: "notScheduled" | "notFound" };

/**
 * Creates what the interview's tool and calendar call for, in order: the Zoom or Teams meeting,
 * then the Google Calendar event (with Meet when the tool is "meet"). Throws IntegrationError when
 * a connected account is missing or refuses; the caller reports it to staff.
 */
export async function prepareMeeting(interviewId: string, orgId: string): Promise<MeetingOutcome> {
  let row = await loadInterview(interviewId, orgId);
  if (!row) return { status: "skipped", reason: "notFound" };
  if (row.status !== "scheduled") return { status: "skipped", reason: "notScheduled" };
  const connected = await connections(orgId);
  const ids: ExternalIds = { ...row.externalIds };
  let meetingUrl = row.meetingUrl;

  const need = (provider: Provider) => {
    if (!connected.has(provider)) throw new IntegrationError("not_connected", provider);
  };

  if (row.tool === "zoom" && !ids.zoom) {
    need("zoom");
    const meeting = await createZoomMeeting(orgId, meetingInput(row));
    ids.zoom = meeting.id;
    meetingUrl = meeting.joinUrl;
    await save(interviewId, { externalIds: ids, meetingUrl });
  }
  if (row.tool === "teams" && !ids.microsoft) {
    need("microsoft");
    const meeting = await createTeamsMeeting(orgId, meetingInput(row));
    ids.microsoft = meeting.id;
    meetingUrl = meeting.joinUrl;
    await save(interviewId, { externalIds: ids, meetingUrl });
  }

  // Meet links come with a Google Calendar event: on the linked calendar, else the primary one.
  const googleScopes = connected.get("google");
  const calendarId = row.googleCalendarId ?? (row.tool === "meet" ? "primary" : null);
  if (calendarId && !ids.google) {
    if (row.tool === "meet") need("google");
    if (googleScopes && grants("google", googleScopes, "calendar")) {
      row = { ...row, meetingUrl };
      const event = await createGoogleEvent(orgId, calendarId, {
        ...meetingInput(row),
        meet: row.tool === "meet",
      });
      ids.google = event.id;
      if (row.tool === "meet") meetingUrl = event.joinUrl;
      await save(interviewId, { externalIds: ids, meetingUrl });
    } else if (row.tool === "meet") {
      throw new IntegrationError("scope", "google calendar");
    }
  }

  // Canceled while this ran: take back what was just made.
  const after = await loadInterview(interviewId, orgId);
  if (after && after.status === "canceled") {
    await cleanUpMeeting(interviewId, orgId);
    return { status: "skipped", reason: "notScheduled" };
  }
  return { status: "ready", meetingUrl };
}

/** Removes the interview's calendar event, meeting and bot (after a cancellation), or only `keys`. */
export async function cleanUpMeeting(
  interviewId: string,
  orgId: string,
  keys?: (keyof ExternalIds)[],
): Promise<string[]> {
  const row = await loadInterview(interviewId, orgId);
  if (!row) return [];
  const ids = { ...row.externalIds };
  const removed: string[] = [];
  const attempt = async (key: keyof ExternalIds, remove: (id: string) => Promise<void>) => {
    const id = ids[key];
    if (!id || (keys && !keys.includes(key))) return;
    try {
      await remove(id);
    } catch (error) {
      // A disconnected account can't remove anything any more; the admin cleans up by hand.
      if (!(error instanceof IntegrationError) || error.code === "provider") throw error;
    }
    delete ids[key];
    removed.push(key);
    await save(interviewId, { externalIds: ids });
  };
  await attempt("bot", removeBot);
  await attempt("zoom", (id) => deleteZoomMeeting(orgId, id));
  await attempt("microsoft", (id) => deleteTeamsMeeting(orgId, id));
  await attempt("google", (id) => deleteGoogleEvent(orgId, row.googleCalendarId ?? "primary", id));
  return removed;
}

// --- Meeting bot ---------------------------------------------------------------------------------

/** The secret in the bot's webhook path for one interview (Recall calls the URL as given). */
export function botWebhookToken(interviewId: string): string {
  return createHmac("sha256", deriveKey("mask0/recall/webhook/v1"))
    .update(interviewId)
    .digest("base64url");
}

export function verifyBotWebhookToken(interviewId: string, token: string): boolean {
  const expected = Buffer.from(botWebhookToken(interviewId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** How long before the start the bot asks to join (it waits in the lobby if it must). */
const BOT_EARLY_MS = 2 * 60_000;

export type BotOutcome =
  | { status: "scheduled"; botId: string; fake: boolean }
  | {
      status: "skipped";
      reason: "notFound" | "notScheduled" | "off" | "declined" | "offline" | "noLink" | "exists";
    };

/**
 * Sends the meeting bot to an online interview when the company records interviews and the
 * candidate hasn't declined (docs/02 M11-5). The transcript arrives through the webhook.
 */
export async function scheduleBot(
  interviewId: string,
  orgId: string,
  now: Date,
): Promise<BotOutcome> {
  const row = await loadInterview(interviewId, orgId);
  if (!row) return { status: "skipped", reason: "notFound" };
  if (row.status !== "scheduled") return { status: "skipped", reason: "notScheduled" };
  if (!row.recordsInterviews || !meetingBotAvailable()) return { status: "skipped", reason: "off" };
  if (!row.recordingAllowed) return { status: "skipped", reason: "declined" };
  if (row.tool === "onsite") return { status: "skipped", reason: "offline" };
  if (!row.meetingUrl) return { status: "skipped", reason: "noLink" };
  if (row.externalIds.bot) return { status: "skipped", reason: "exists" };

  const joinAt = new Date(row.startsAt.getTime() - BOT_EARLY_MS);
  const botId = await createBot({
    meetingUrl: row.meetingUrl,
    botName: row.botName || `${row.orgName} 面接記録`,
    // Recall wants scheduled bots at least 10 minutes ahead; sooner ones join at once.
    joinAt: joinAt.getTime() - now.getTime() > 11 * 60_000 ? joinAt : null,
    webhookUrl: `${getPublicEnv().appUrl}/api/webhooks/recall/${interviewId}/${botWebhookToken(interviewId)}`,
    metadata: { interview_id: interviewId, org_id: orgId },
  });
  await save(interviewId, { externalIds: { ...row.externalIds, bot: botId } });
  return { status: "scheduled", botId, fake: integrationsFake() };
}
