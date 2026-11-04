import "server-only";
import { createHash } from "node:crypto";
import type { Interval } from "@/features/scheduling/slots";
import { integrationsFake, recallConfig } from "./config";
import { IntegrationError, providerFetch } from "./oauth";

// Calls to Google Calendar and Gmail, Zoom, Microsoft Graph (Teams) and Recall.ai (docs/05 §2).
// Fake mode (INTEGRATIONS_FAKE=1) answers locally with made-up ids and links.

export type MeetingInput = {
  /** Stable per interview, so a retried create finds the first one instead of making two. */
  key: string;
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
};

export type CreatedMeeting = { id: string; joinUrl: string | null };

const fakeCode = (key: string, length: number) =>
  createHash("sha256").update(key).digest("hex").slice(0, length);

async function failUnlessOk(response: Response, what: string, okStatuses: number[] = []) {
  if (response.ok || okStatuses.includes(response.status)) return;
  throw new IntegrationError("provider", `${what}: ${response.status}`);
}

// --- Google Calendar and Meet -------------------------------------------------------------------

const CALENDAR = "https://www.googleapis.com/calendar/v3";

type GoogleEvent = {
  id: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] };
};

const meetLink = (event: GoogleEvent) =>
  event.hangoutLink ??
  event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
  null;

/** A Google event id from the interview id: Google allows a–v and 0–9, so hex works. */
export const googleEventId = (key: string) =>
  `mask0${key.replace(/[^0-9a-f]/gi, "").toLowerCase()}`;

/** Adds the interview to a Google calendar, with a Meet link when asked (M8-6). */
export async function createGoogleEvent(
  orgId: string,
  calendarId: string,
  input: MeetingInput & { meet: boolean },
): Promise<CreatedMeeting> {
  const id = googleEventId(input.key);
  if (integrationsFake()) {
    const code = fakeCode(input.key, 10);
    return {
      id,
      joinUrl: input.meet
        ? `https://meet.google.com/${code.slice(0, 3)}-${code.slice(3, 7)}-${code.slice(7)}`
        : null,
    };
  }
  const base = `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await providerFetch(
    orgId,
    "google",
    `${base}?conferenceDataVersion=1&sendUpdates=none`,
    {
      method: "POST",
      body: JSON.stringify({
        id,
        summary: input.title,
        description: input.description,
        location: input.location ?? undefined,
        start: { dateTime: input.startsAt.toISOString(), timeZone: "Asia/Tokyo" },
        end: { dateTime: input.endsAt.toISOString(), timeZone: "Asia/Tokyo" },
        ...(input.meet
          ? {
              conferenceData: {
                createRequest: { requestId: id, conferenceSolutionKey: { type: "hangoutsMeet" } },
              },
            }
          : {}),
      }),
    },
  );
  // 409: a retry after an earlier attempt that created it.
  if (response.status === 409) {
    const existing = await providerFetch(orgId, "google", `${base}/${id}`);
    await failUnlessOk(existing, "google event get");
    const event = (await existing.json()) as GoogleEvent;
    return { id: event.id, joinUrl: meetLink(event) };
  }
  await failUnlessOk(response, "google event insert");
  const event = (await response.json()) as GoogleEvent;
  return { id: event.id, joinUrl: meetLink(event) };
}

export async function deleteGoogleEvent(orgId: string, calendarId: string, eventId: string) {
  if (integrationsFake()) return;
  const response = await providerFetch(
    orgId,
    "google",
    `${CALENDAR}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    { method: "DELETE" },
  );
  await failUnlessOk(response, "google event delete", [404, 410]);
}

/** Busy times on a Google calendar (docs/05 §9), so candidates aren't offered them. */
export async function googleBusy(
  orgId: string,
  calendarId: string,
  from: Date,
  to: Date,
): Promise<Interval[]> {
  if (integrationsFake()) return fakeBusy(from, to);
  const response = await providerFetch(orgId, "google", `${CALENDAR}/freeBusy`, {
    method: "POST",
    body: JSON.stringify({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      timeZone: "Asia/Tokyo",
      items: [{ id: calendarId }],
    }),
  });
  await failUnlessOk(response, "google freeBusy");
  const json = (await response.json()) as {
    calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
  };
  const entry = json.calendars?.[calendarId];
  if (entry?.errors?.length)
    throw new IntegrationError("provider", "google freeBusy: calendar error");
  return (entry?.busy ?? []).map((b) => ({ startsAt: new Date(b.start), endsAt: new Date(b.end) }));
}

/** Fake calendars are busy over lunch, 12:00–13:00 Japan time, every day. */
function fakeBusy(from: Date, to: Date): Interval[] {
  const busy: Interval[] = [];
  const day = 86400_000;
  // 03:00 UTC is 12:00 in Japan (no DST).
  let start = Math.floor(from.getTime() / day) * day + 3 * 3600_000;
  for (; start < to.getTime(); start += day) {
    busy.push({ startsAt: new Date(start), endsAt: new Date(start + 3600_000) });
  }
  return busy;
}

/** Sends a MIME message from the connected Gmail account (M9-4). */
export async function sendGmail(orgId: string, mime: string): Promise<string | null> {
  if (integrationsFake()) return null;
  const response = await providerFetch(
    orgId,
    "google",
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      purpose: "gmail",
      body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url") }),
    },
  );
  await failUnlessOk(response, "gmail send");
  return ((await response.json()) as { id?: string }).id ?? null;
}

// --- Zoom ---------------------------------------------------------------------------------------

export async function createZoomMeeting(
  orgId: string,
  input: MeetingInput,
): Promise<CreatedMeeting> {
  if (integrationsFake()) {
    const id = String(parseInt(fakeCode(input.key, 10), 16)).slice(0, 11);
    return { id, joinUrl: `https://zoom.us/j/${id}` };
  }
  const minutes = Math.round((input.endsAt.getTime() - input.startsAt.getTime()) / 60_000);
  const response = await providerFetch(orgId, "zoom", "https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    body: JSON.stringify({
      topic: input.title.slice(0, 200),
      agenda: input.description.slice(0, 2000),
      type: 2,
      start_time: input.startsAt.toISOString().replace(/\.\d{3}Z$/, "Z"),
      duration: minutes,
      timezone: "Asia/Tokyo",
      settings: { join_before_host: false, waiting_room: true },
    }),
  });
  await failUnlessOk(response, "zoom meeting create");
  const meeting = (await response.json()) as { id: number | string; join_url: string };
  return { id: String(meeting.id), joinUrl: meeting.join_url };
}

export async function deleteZoomMeeting(orgId: string, meetingId: string) {
  if (integrationsFake()) return;
  const response = await providerFetch(
    orgId,
    "zoom",
    `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`,
    { method: "DELETE" },
  );
  await failUnlessOk(response, "zoom meeting delete", [404]);
}

// --- Microsoft Teams (an Outlook calendar event with a Teams meeting) ----------------------------

const utc = (date: Date) => ({ dateTime: date.toISOString().replace(/Z$/, ""), timeZone: "UTC" });

export async function createTeamsMeeting(
  orgId: string,
  input: MeetingInput,
): Promise<CreatedMeeting> {
  if (integrationsFake()) {
    return {
      id: `fake-${fakeCode(input.key, 16)}`,
      joinUrl: `https://teams.microsoft.com/l/meetup-join/${fakeCode(input.key, 24)}`,
    };
  }
  const response = await providerFetch(
    orgId,
    "microsoft",
    "https://graph.microsoft.com/v1.0/me/events",
    {
      method: "POST",
      body: JSON.stringify({
        subject: input.title,
        body: { contentType: "text", content: input.description },
        start: utc(input.startsAt),
        end: utc(input.endsAt),
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
        allowNewTimeProposals: false,
        // Graph's idempotency key: a retried create returns the first event.
        transactionId: input.key,
      }),
    },
  );
  await failUnlessOk(response, "graph event create");
  const event = (await response.json()) as { id: string; onlineMeeting?: { joinUrl?: string } };
  return { id: event.id, joinUrl: event.onlineMeeting?.joinUrl ?? null };
}

export async function deleteTeamsMeeting(orgId: string, eventId: string) {
  if (integrationsFake()) return;
  const response = await providerFetch(
    orgId,
    "microsoft",
    `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  await failUnlessOk(response, "graph event delete", [404]);
}

// --- Recall.ai meeting bot ----------------------------------------------------------------------

async function recallFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const config = recallConfig();
  if (!config) throw new IntegrationError("not_connected", "RECALL_API_KEY is not set");
  return fetch(`${config.baseUrl}/api/v1/${path}`, {
    ...init,
    headers: {
      authorization: `Token ${config.apiKey}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
  });
}

/** Sends the bot to the meeting at `joinAt`, streaming each utterance to `webhookUrl` (M11-5). */
export async function createBot(input: {
  meetingUrl: string;
  botName: string;
  joinAt: Date | null;
  webhookUrl: string;
  metadata: Record<string, string>;
}): Promise<string> {
  if (integrationsFake()) return `fake-bot-${input.metadata.interview_id}`;
  const config = recallConfig()!;
  const response = await recallFetch("bot/", {
    method: "POST",
    body: JSON.stringify({
      meeting_url: input.meetingUrl,
      bot_name: input.botName.slice(0, 100),
      ...(input.joinAt ? { join_at: input.joinAt.toISOString() } : {}),
      metadata: input.metadata,
      recording_config: {
        transcript: { provider: config.transcriptProvider },
        realtime_endpoints: [
          { type: "webhook", url: input.webhookUrl, events: ["transcript.data"] },
        ],
      },
    }),
  });
  await failUnlessOk(response, "recall bot create");
  return ((await response.json()) as { id: string }).id;
}

/** Calls the bot off: a scheduled bot is deleted, one already in the call leaves it. */
export async function removeBot(botId: string) {
  if (integrationsFake()) return;
  const deleted = await recallFetch(`bot/${encodeURIComponent(botId)}/`, { method: "DELETE" });
  if (deleted.ok || deleted.status === 404) return;
  const left = await recallFetch(`bot/${encodeURIComponent(botId)}/leave_call/`, {
    method: "POST",
  });
  await failUnlessOk(left, "recall leave_call", [404, 400]);
}
