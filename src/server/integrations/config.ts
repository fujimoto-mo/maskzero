import "server-only";
import { getPublicEnv } from "@/lib/env";

// Which outside services are set up (docs/02 M8-6, M9-4, M11-5). Each stays off until its keys are
// in the environment. INTEGRATIONS_FAKE=1 (local development only) stands in for all of them:
// connections succeed without leaving the app, meetings get made-up links, Gmail sends are dry runs
// and the meeting bot replays a sample interview.

export type Provider = "google" | "zoom" | "microsoft";
export const PROVIDERS: Provider[] = ["google", "zoom", "microsoft"];

export const integrationsFake = () => process.env.INTEGRATIONS_FAKE === "1";

type OAuthApp = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  /** Zoom takes its scopes from the app's settings, not from the request. */
  sendsScopes: boolean;
  /** Zoom wants the client credentials as Basic auth on the token request. */
  basicAuth: boolean;
};

export function oauthApp(provider: Provider): OAuthApp | null {
  switch (provider) {
    case "google": {
      const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        sendsScopes: true,
        basicAuth: false,
      };
    }
    case "zoom": {
      const id = process.env.ZOOM_CLIENT_ID;
      const secret = process.env.ZOOM_CLIENT_SECRET;
      if (!id || !secret) return null;
      return {
        clientId: id,
        clientSecret: secret,
        authorizeUrl: "https://zoom.us/oauth/authorize",
        tokenUrl: "https://zoom.us/oauth/token",
        sendsScopes: false,
        basicAuth: true,
      };
    }
    case "microsoft": {
      const id = process.env.MICROSOFT_CLIENT_ID;
      const secret = process.env.MICROSOFT_CLIENT_SECRET;
      if (!id || !secret) return null;
      const tenant = process.env.MICROSOFT_TENANT || "common";
      const base = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0`;
      return {
        clientId: id,
        clientSecret: secret,
        authorizeUrl: `${base}/authorize`,
        tokenUrl: `${base}/token`,
        sendsScopes: true,
        basicAuth: false,
      };
    }
  }
}

export const providerAvailable = (provider: Provider) =>
  integrationsFake() || oauthApp(provider) !== null;

export const redirectUri = (provider: Provider) =>
  `${getPublicEnv().appUrl}/api/oauth/${provider}/callback`;

/** What a connection is for: Google asks for Calendar and Gmail separately (incremental consent). */
export type Purpose = "calendar" | "gmail";

export const GOOGLE_SCOPES = {
  base: ["openid", "email"],
  calendar: [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.freebusy",
  ],
  gmail: ["https://www.googleapis.com/auth/gmail.send"],
} as const;

export const MICROSOFT_SCOPES = [
  "openid",
  "email",
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
];

export function requestedScopes(provider: Provider, purpose: Purpose): string[] {
  if (provider === "google") return [...GOOGLE_SCOPES.base, ...GOOGLE_SCOPES[purpose]];
  if (provider === "microsoft") return MICROSOFT_SCOPES;
  return [];
}

/** True when the granted scopes cover the purpose (Google grants each one separately). */
export function grants(provider: Provider, scopes: string[], purpose: Purpose): boolean {
  if (provider !== "google") return purpose === "calendar";
  return GOOGLE_SCOPES[purpose].every((s) => scopes.includes(s));
}

export type RecallConfig = { apiKey: string; baseUrl: string; transcriptProvider: unknown };

/**
 * The meeting bot (Recall.ai). Its own low-latency transcription is English-only, so Japanese
 * defaults to Deepgram through Recall (add the Deepgram key in Recall's dashboard), or whatever
 * RECALL_TRANSCRIPT_PROVIDER names as JSON.
 */
export function recallConfig(): RecallConfig | null {
  const apiKey = process.env.RECALL_API_KEY;
  if (!apiKey) return null;
  const region = process.env.RECALL_REGION || "ap-northeast-1";
  let transcriptProvider: unknown = { deepgram_streaming: { language: "ja", model: "nova-2" } };
  if (process.env.RECALL_TRANSCRIPT_PROVIDER) {
    try {
      transcriptProvider = JSON.parse(process.env.RECALL_TRANSCRIPT_PROVIDER);
    } catch {
      throw new Error(
        'RECALL_TRANSCRIPT_PROVIDER must be JSON, such as {"deepgram_streaming":{"language":"ja"}}',
      );
    }
  }
  return { apiKey, baseUrl: `https://${region}.recall.ai`, transcriptProvider };
}

export const meetingBotAvailable = () => integrationsFake() || recallConfig() !== null;
