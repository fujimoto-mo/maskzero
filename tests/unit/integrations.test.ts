import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  capabilities,
  GMAIL_SEND_SCOPE,
  GOOGLE_CALENDAR_ID,
  GOOGLE_CALENDAR_SCOPE,
  toolAvailable,
} from "@/features/integrations/domain";

// Connected accounts (docs/02 M8-6, M9-4) and the meeting bot (M11-5). Provider APIs are never
// called: fetch is stubbed, and so is the token lookup the adapters go through.

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
process.env.PII_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");

const providerFetch = vi.hoisted(() => vi.fn());
vi.mock("@/server/integrations/oauth", async (original) => ({
  ...(await original<typeof import("@/server/integrations/oauth")>()),
  providerFetch,
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = "google-id";
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = "google-secret";
  delete process.env.INTEGRATIONS_FAKE;
});
afterEach(() => {
  vi.unstubAllGlobals();
  providerFetch.mockReset();
});

describe("capabilities", () => {
  it("follows the active connections and Google's granted scopes", () => {
    expect(capabilities([])).toEqual({
      googleCalendar: false,
      gmail: false,
      zoom: false,
      teams: false,
    });
    const can = capabilities([
      { provider: "google", scopes: [GOOGLE_CALENDAR_SCOPE], status: "active" },
      { provider: "zoom", scopes: [], status: "error" },
      { provider: "microsoft", scopes: [], status: "active" },
    ]);
    expect(can).toEqual({ googleCalendar: true, gmail: false, zoom: false, teams: true });
    expect(toolAvailable("meet", can)).toBe(true);
    expect(toolAvailable("zoom", can)).toBe(false);
    expect(toolAvailable("url", capabilities([]))).toBe(true);
    expect(
      capabilities([{ provider: "google", scopes: [GMAIL_SEND_SCOPE], status: "active" }]).gmail,
    ).toBe(true);
  });

  it("accepts Google calendar ids and nothing that could be a path", () => {
    expect(GOOGLE_CALENDAR_ID.test("primary")).toBe(true);
    expect(GOOGLE_CALENDAR_ID.test("saiyo@example.co.jp")).toBe(true);
    expect(GOOGLE_CALENDAR_ID.test("c_abc123@group.calendar.google.com")).toBe(true);
    expect(GOOGLE_CALENDAR_ID.test("../events")).toBe(false);
    expect(GOOGLE_CALENDAR_ID.test("a@b/c")).toBe(false);
  });
});

describe("OAuth", () => {
  it("makes a PKCE pair whose challenge is the verifier's SHA-256", async () => {
    const { pkcePair } = await import("@/server/integrations/oauth");
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("asks Google for offline access to the purpose's scopes, keeping earlier grants", async () => {
    const { authorizationUrl } = await import("@/server/integrations/oauth");
    const url = new URL(authorizationUrl("google", "gmail", "state-1", "challenge-1"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const params = Object.fromEntries(url.searchParams);
    expect(params).toMatchObject({
      client_id: "google-id",
      redirect_uri: "https://app.example.com/api/oauth/google/callback",
      state: "state-1",
      code_challenge: "challenge-1",
      code_challenge_method: "S256",
      access_type: "offline",
      include_granted_scopes: "true",
    });
    expect(params.scope!.split(" ")).toEqual(["openid", "email", GMAIL_SEND_SCOPE]);
  });

  it("goes straight back to the callback in fake mode", async () => {
    process.env.INTEGRATIONS_FAKE = "1";
    const { authorizationUrl, exchangeCode } = await import("@/server/integrations/oauth");
    const url = new URL(authorizationUrl("zoom", "calendar", "s", "c"));
    expect(url.pathname).toBe("/api/oauth/zoom/callback");
    expect(url.searchParams.get("code")).toBe("fake-calendar");
    const connection = await exchangeCode("google", "fake-gmail", "v");
    expect(connection.scopes).toContain(GMAIL_SEND_SCOPE);
  });

  it("trades the code with the verifier and reads the account from the ID token", async () => {
    const claims = Buffer.from(JSON.stringify({ email: "saiyo@example.com" })).toString(
      "base64url",
    );
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
        scope: `openid email ${GOOGLE_CALENDAR_SCOPE}`,
        id_token: `x.${claims}.y`,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { exchangeCode } = await import("@/server/integrations/oauth");
    const connection = await exchangeCode("google", "code-1", "verifier-1");
    expect(connection.accountEmail).toBe("saiyo@example.com");
    expect(connection.scopes).toContain(GOOGLE_CALENDAR_SCOPE);
    expect(connection.tokens).toMatchObject({ accessToken: "at", refreshToken: "rt" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://oauth2.googleapis.com/token");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("reports a revoked grant as such", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "invalid_grant" }, 400)));
    const { exchangeCode } = await import("@/server/integrations/oauth");
    await expect(exchangeCode("google", "c", "v")).rejects.toEqual(
      expect.objectContaining({ code: "revoked" }),
    );
  });

  it("merges scopes from incremental consent", async () => {
    const { mergeScopes } = await import("@/server/integrations/oauth");
    expect(mergeScopes(["b", "a"], ["a", "c"])).toEqual(["a", "b", "c"]);
  });
});

const input = {
  key: "0193a2b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
  title: "面接：山田さん（営業職・1次）",
  description: "サンプル商事",
  startsAt: new Date("2026-11-10T01:00:00Z"),
  endsAt: new Date("2026-11-10T02:00:00Z"),
};

describe("meetings", () => {
  it("creates a Google event with a Meet link, idempotently by the interview id", async () => {
    const { createGoogleEvent, googleEventId } = await import("@/server/integrations/providers");
    providerFetch.mockResolvedValueOnce(
      json({ id: googleEventId(input.key), hangoutLink: "https://meet.google.com/abc-defg-hij" }),
    );
    const event = await createGoogleEvent("org", "primary", { ...input, meet: true });
    expect(event).toEqual({
      id: "mask00193a2b45c6d7e8f9a0b1c2d3e4f5a6b",
      joinUrl: "https://meet.google.com/abc-defg-hij",
    });
    // Google allows only a–v and 0–9 in event ids.
    expect(event.id).toMatch(/^[a-v0-9]{5,1024}$/);
    const [, , url, init] = providerFetch.mock.calls[0]!;
    expect(url).toContain("/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none");
    const body = JSON.parse(init.body);
    expect(body.conferenceData.createRequest.conferenceSolutionKey.type).toBe("hangoutsMeet");
    expect(body.start).toEqual({ dateTime: "2026-11-10T01:00:00.000Z", timeZone: "Asia/Tokyo" });
  });

  it("finds the event a retried create already made", async () => {
    const { createGoogleEvent } = await import("@/server/integrations/providers");
    providerFetch.mockResolvedValueOnce(json({ error: { code: 409 } }, 409)).mockResolvedValueOnce(
      json({
        id: "mask0x",
        conferenceData: {
          entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/x" }],
        },
      }),
    );
    const calendarId = "c@group.calendar.google.com";
    const event = await createGoogleEvent("org", calendarId, { ...input, meet: true });
    expect(event.joinUrl).toBe("https://meet.google.com/x");
    expect(providerFetch.mock.calls[1]![2]).toContain(
      "/calendars/c%40group.calendar.google.com/events/",
    );
  });

  it("reads busy times from Google", async () => {
    const { googleBusy } = await import("@/server/integrations/providers");
    providerFetch.mockResolvedValueOnce(
      json({
        calendars: {
          primary: { busy: [{ start: "2026-11-10T03:00:00Z", end: "2026-11-10T04:00:00Z" }] },
        },
      }),
    );
    expect(await googleBusy("org", "primary", input.startsAt, input.endsAt)).toEqual([
      { startsAt: new Date("2026-11-10T03:00:00Z"), endsAt: new Date("2026-11-10T04:00:00Z") },
    ]);
  });

  it("creates Zoom and Teams meetings for the interview's time", async () => {
    const { createTeamsMeeting, createZoomMeeting } =
      await import("@/server/integrations/providers");
    providerFetch.mockResolvedValueOnce(
      json({ id: 81234567890, join_url: "https://zoom.us/j/81234567890" }),
    );
    expect(await createZoomMeeting("org", input)).toEqual({
      id: "81234567890",
      joinUrl: "https://zoom.us/j/81234567890",
    });
    expect(JSON.parse(providerFetch.mock.calls[0]![3].body)).toMatchObject({
      type: 2,
      start_time: "2026-11-10T01:00:00Z",
      duration: 60,
      settings: { waiting_room: true },
    });

    providerFetch.mockResolvedValueOnce(
      json({
        id: "AAMk",
        onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/x" },
      }),
    );
    expect(await createTeamsMeeting("org", input)).toEqual({
      id: "AAMk",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/x",
    });
    expect(JSON.parse(providerFetch.mock.calls[1]![3].body)).toMatchObject({
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      transactionId: input.key,
      start: { dateTime: "2026-11-10T01:00:00.000", timeZone: "UTC" },
    });
  });
});

describe("meeting bot", () => {
  beforeEach(() => {
    process.env.RECALL_API_KEY = "recall-key";
    delete process.env.RECALL_REGION;
    delete process.env.RECALL_TRANSCRIPT_PROVIDER;
  });

  it("sends the bot with Japanese real-time transcription to its webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ id: "bot-1" }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const { createBot } = await import("@/server/integrations/providers");
    const webhookUrl = "https://app.example.com/api/webhooks/recall/i/t";
    const id = await createBot({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      botName: "サンプル商事 面接記録",
      joinAt: new Date("2026-11-10T00:58:00Z"),
      webhookUrl,
      metadata: { interview_id: "i", org_id: "o" },
    });
    expect(id).toBe("bot-1");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://ap-northeast-1.recall.ai/api/v1/bot/");
    expect(init.headers.authorization).toBe("Token recall-key");
    const body = JSON.parse(init.body);
    expect(body.recording_config.transcript.provider).toEqual({
      deepgram_streaming: { language: "ja", model: "nova-2" },
    });
    expect(body.recording_config.realtime_endpoints).toEqual([
      { type: "webhook", url: webhookUrl, events: ["transcript.data"] },
    ]);
    expect(body.join_at).toBe("2026-11-10T00:58:00.000Z");
  });

  it("deletes a scheduled bot, and makes one already in the call leave", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { removeBot } = await import("@/server/integrations/providers");
    await removeBot("bot-1");
    expect(fetchMock.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ["DELETE", "https://ap-northeast-1.recall.ai/api/v1/bot/bot-1/"],
      ["POST", "https://ap-northeast-1.recall.ai/api/v1/bot/bot-1/leave_call/"],
    ]);
  });

  it("accepts the webhook only with the interview's own token", async () => {
    const { botWebhookToken, verifyBotWebhookToken } =
      await import("@/server/integrations/meetings");
    const a = "0193a2b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b";
    const b = "0193a2b4-5c6d-7e8f-9a0b-1c2d3e4f5a6c";
    expect(verifyBotWebhookToken(a, botWebhookToken(a))).toBe(true);
    expect(verifyBotWebhookToken(b, botWebhookToken(a))).toBe(false);
    expect(verifyBotWebhookToken(a, "short")).toBe(false);
  });
});
