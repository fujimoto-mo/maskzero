import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { decryptPii, encryptPii } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import { integrations } from "@/server/db/schema";
import {
  grants,
  integrationsFake,
  oauthApp,
  type Provider,
  type Purpose,
  redirectUri,
  requestedScopes,
} from "./config";

// OAuth for connected accounts (docs/03 /api/oauth/*): authorization code with PKCE, tokens
// encrypted at rest, refreshed by server code under a row lock (Zoom and Microsoft rotate refresh
// tokens, so two refreshes at once would lose one).

export type OAuthTokens = { accessToken: string; refreshToken: string | null; expiresAt: number };

export type IntegrationErrorCode = "not_connected" | "revoked" | "scope" | "provider";

export class IntegrationError extends Error {
  constructor(
    readonly code: IntegrationErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "IntegrationError";
  }
}

const base64url = (data: Buffer) => data.toString("base64url");

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

export const newState = () => base64url(randomBytes(24));

/** Where to send the admin to grant access; in fake mode, straight back to our callback. */
export function authorizationUrl(
  provider: Provider,
  purpose: Purpose,
  state: string,
  challenge: string,
): string {
  if (integrationsFake()) {
    const url = new URL(redirectUri(provider));
    url.searchParams.set("code", `fake-${purpose}`);
    url.searchParams.set("state", state);
    return url.toString();
  }
  const app = oauthApp(provider);
  if (!app) throw new IntegrationError("not_connected", `${provider} is not configured`);
  const url = new URL(app.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", redirectUri(provider));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (app.sendsScopes) url.searchParams.set("scope", requestedScopes(provider, purpose).join(" "));
  if (provider === "google") {
    // A refresh token every time, and the scopes granted earlier kept (Calendar, then Gmail).
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
  }
  if (provider === "microsoft") url.searchParams.set("prompt", "select_account");
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
};

async function tokenRequest(provider: Provider, params: Record<string, string>) {
  const app = oauthApp(provider);
  if (!app) throw new IntegrationError("not_connected", `${provider} is not configured`);
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (app.basicAuth) {
    headers.authorization = `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", app.clientId);
    body.set("client_secret", app.clientSecret);
  }
  const response = await fetch(app.tokenUrl, { method: "POST", headers, body });
  const json = (await response.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!response.ok || !json.access_token) {
    // invalid_grant: the refresh token was revoked or expired; the admin has to connect again.
    if (json.error === "invalid_grant") throw new IntegrationError("revoked");
    throw new IntegrationError(
      "provider",
      `${provider} token endpoint: ${response.status} ${json.error ?? ""}`,
    );
  }
  return json;
}

const toTokens = (json: TokenResponse, previousRefresh: string | null = null): OAuthTokens => ({
  accessToken: json.access_token,
  refreshToken: json.refresh_token ?? previousRefresh,
  expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
});

/** The email claim of an ID token fetched directly from the provider over TLS (OIDC §3.1.3.7). */
function idTokenEmail(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: string;
      preferred_username?: string;
    };
    return claims.email ?? claims.preferred_username ?? null;
  } catch {
    return null;
  }
}

async function zoomEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://api.zoom.us/v2/users/me", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return ((await response.json()) as { email?: string }).email ?? null;
}

export type Connection = { tokens: OAuthTokens; scopes: string[]; accountEmail: string };

/** Trades the authorization code for tokens and finds out which account was connected. */
export async function exchangeCode(
  provider: Provider,
  code: string,
  verifier: string,
): Promise<Connection> {
  if (integrationsFake()) {
    const purpose: Purpose = code === "fake-gmail" ? "gmail" : "calendar";
    return {
      tokens: {
        accessToken: "fake",
        refreshToken: "fake",
        expiresAt: Date.now() + 365 * 86400_000,
      },
      scopes: requestedScopes(provider, purpose),
      accountEmail: `saiyo@${provider}.example.com`,
    };
  }
  const json = await tokenRequest(provider, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(provider),
    code_verifier: verifier,
  });
  const accountEmail =
    idTokenEmail(json.id_token) ??
    (provider === "zoom" ? await zoomEmail(json.access_token) : null) ??
    "";
  return {
    tokens: toTokens(json),
    scopes: json.scope ? json.scope.split(/[\s,]+/).filter(Boolean) : [],
    accountEmail,
  };
}

/** Joins the scopes granted before with the new ones (Google's incremental consent). */
export function mergeScopes(before: string[], after: string[]): string[] {
  return [...new Set([...before, ...after])].sort();
}

const REFRESH_MARGIN_MS = 2 * 60_000;

/**
 * A current access token for the company's account, refreshed when it is about to expire. A
 * revoked connection is marked so admins see it in 設定 → 連携, and callers fall back or report.
 */
export async function accessToken(
  orgId: string,
  provider: Provider,
  purpose: Purpose = "calendar",
): Promise<{ token: string; accountEmail: string }> {
  const db = getAdminDb();
  const where = and(eq(integrations.orgId, orgId), eq(integrations.provider, provider));
  const [row] = await db
    .select({
      tokensEnc: integrations.tokensEnc,
      scopes: integrations.scopes,
      status: integrations.status,
      accountEmail: integrations.accountEmail,
    })
    .from(integrations)
    .where(where);
  if (!row) throw new IntegrationError("not_connected");
  if (row.status !== "active") throw new IntegrationError("revoked");
  if (!grants(provider, row.scopes, purpose)) throw new IntegrationError("scope");
  if (integrationsFake()) return { token: "fake", accountEmail: row.accountEmail };

  const tokens = JSON.parse(decryptPii(row.tokensEnc)) as OAuthTokens;
  if (tokens.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return { token: tokens.accessToken, accountEmail: row.accountEmail };
  }

  try {
    const token = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ tokensEnc: integrations.tokensEnc })
        .from(integrations)
        .where(where)
        .for("update");
      if (!locked) throw new IntegrationError("not_connected");
      const current = JSON.parse(decryptPii(locked.tokensEnc)) as OAuthTokens;
      // Another job refreshed it while this one waited for the lock.
      if (current.expiresAt - REFRESH_MARGIN_MS > Date.now()) return current.accessToken;
      if (!current.refreshToken) throw new IntegrationError("revoked");
      const params: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: current.refreshToken,
      };
      if (provider === "microsoft") params.scope = requestedScopes(provider, purpose).join(" ");
      const fresh = toTokens(await tokenRequest(provider, params), current.refreshToken);
      await tx
        .update(integrations)
        .set({ tokensEnc: encryptPii(JSON.stringify(fresh)) })
        .where(where);
      return fresh.accessToken;
    });
    return { token, accountEmail: row.accountEmail };
  } catch (error) {
    if (error instanceof IntegrationError && error.code === "revoked") {
      await markBroken(orgId, provider, "revoked");
    }
    throw error;
  }
}

/** Marks a connection as no longer working, so admins are asked to connect it again. */
export async function markBroken(orgId: string, provider: Provider, code: IntegrationErrorCode) {
  await getAdminDb()
    .update(integrations)
    .set({ status: "error", error: code })
    .where(and(eq(integrations.orgId, orgId), eq(integrations.provider, provider)));
}

/** Calls a provider API with the company's token; a 401 means the grant is gone. */
export async function providerFetch(
  orgId: string,
  provider: Provider,
  url: string,
  init: RequestInit & { purpose?: Purpose } = {},
): Promise<Response> {
  const { token } = await accessToken(orgId, provider, init.purpose);
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (response.status === 401) {
    await markBroken(orgId, provider, "revoked");
    throw new IntegrationError("revoked", `${provider}: 401`);
  }
  if (response.status === 403) {
    const text = await response.text().catch(() => "");
    if (/insufficient|scope|permission/i.test(text))
      throw new IntegrationError("scope", `${provider}: 403`);
    throw new IntegrationError("provider", `${provider}: 403`);
  }
  return response;
}
