import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import type { MemberCtx } from "@/server/auth/session";
import { encryptPii } from "@/server/crypto/pii";
import { withRls } from "@/server/db/rls";
import { integrations } from "@/server/db/schema";
import { PROVIDERS, type Provider, type Purpose } from "./config";
import { type Connection, mergeScopes } from "./oauth";

// Connecting an account (docs/03 /api/oauth/*): the start route keeps the state and PKCE verifier
// in a short-lived httpOnly cookie, and the callback stores the connection as the admin, under RLS.

const COOKIE = "mask0_oauth";
const TTL_SECONDS = 600;

const pendingSchema = z.object({
  state: z.string().min(16),
  verifier: z.string().min(32),
  provider: z.enum(PROVIDERS as [Provider, ...Provider[]]),
  purpose: z.enum(["calendar", "gmail"]),
  org: z.string().min(1).max(100),
  client: z.string().min(1).max(100),
});
export type PendingConnection = z.infer<typeof pendingSchema>;

export const isProvider = (value: string): value is Provider =>
  (PROVIDERS as string[]).includes(value);

export async function rememberPending(pending: PendingConnection): Promise<void> {
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify(pending)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/oauth",
    maxAge: TTL_SECONDS,
  });
}

/** The pending connection for this callback, removed so a code can't be replayed. */
export async function takePending(provider: Provider, state: string | null) {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete({ name: COOKIE, path: "/api/oauth" });
  if (!raw || !state) return null;
  try {
    const parsed = pendingSchema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    if (!parsed.success || parsed.data.provider !== provider || parsed.data.state !== state)
      return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Saves the connection, replacing the company's earlier one for the provider. Google keeps the
 * scopes granted before when the same account adds one (Calendar, then Gmail).
 */
export async function saveConnection(
  ctx: MemberCtx,
  provider: Provider,
  purpose: Purpose,
  connection: Connection,
): Promise<void> {
  await withRls(ctx, async (tx) => {
    const where = and(eq(integrations.orgId, ctx.orgId), eq(integrations.provider, provider));
    const [before] = await tx
      .select({ accountEmail: integrations.accountEmail, scopes: integrations.scopes })
      .from(integrations)
      .where(where);
    const scopes =
      before && before.accountEmail === connection.accountEmail
        ? mergeScopes(before.scopes, connection.scopes)
        : mergeScopes([], connection.scopes);
    await tx.delete(integrations).where(where);
    await tx.insert(integrations).values({
      orgId: ctx.orgId,
      provider,
      accountEmail: connection.accountEmail,
      scopes,
      tokensEnc: encryptPii(JSON.stringify(connection.tokens)),
      connectedBy: ctx.userId,
    });
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "integration.connected",
      targetType: "integration",
      meta: { provider, purpose },
    });
  });
}
