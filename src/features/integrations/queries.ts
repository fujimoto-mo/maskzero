import "server-only";
import { eq } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { integrations, organizations } from "@/server/db/schema";
import {
  meetingBotAvailable,
  PROVIDERS,
  type Provider,
  providerAvailable,
} from "@/server/integrations/config";
import { capabilities, type Capabilities, type ConnectionRow } from "./domain";

export type Connection = ConnectionRow & {
  accountEmail: string;
  error: string | null;
  connectedAt: string;
};

export type IntegrationSettings = {
  connections: Connection[];
  /** Providers whose OAuth app is set up for this deployment. */
  available: Record<Provider, boolean>;
  can: Capabilities;
  emailVia: "mask0" | "gmail";
  botName: string | null;
  botAvailable: boolean;
  recordsInterviews: boolean;
};

/** The company's connected accounts (no tokens: there is no grant on them). */
export async function getConnections(ctx: MemberCtx): Promise<Connection[]> {
  const rows = await withRls(ctx, (tx) =>
    tx
      .select({
        provider: integrations.provider,
        accountEmail: integrations.accountEmail,
        scopes: integrations.scopes,
        status: integrations.status,
        error: integrations.error,
        connectedAt: integrations.connectedAt,
      })
      .from(integrations)
      .where(eq(integrations.orgId, ctx.orgId)),
  );
  return rows.map((r) => ({ ...r, connectedAt: r.connectedAt.toISOString() }));
}

export async function getCapabilities(ctx: MemberCtx): Promise<Capabilities> {
  return capabilities(await getConnections(ctx));
}

/** 設定 → 連携 (docs/03 settings/integrations). */
export async function getIntegrationSettings(ctx: MemberCtx): Promise<IntegrationSettings> {
  const [connections, [org]] = await Promise.all([
    getConnections(ctx),
    withRls(ctx, (tx) =>
      tx
        .select({
          emailVia: organizations.emailVia,
          botName: organizations.botName,
          recordsInterviews: organizations.recordsInterviews,
        })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId)),
    ),
  ]);
  return {
    connections,
    available: Object.fromEntries(PROVIDERS.map((p) => [p, providerAvailable(p)])) as Record<
      Provider,
      boolean
    >,
    can: capabilities(connections),
    emailVia: org?.emailVia === "gmail" ? "gmail" : "mask0",
    botName: org?.botName ?? null,
    botAvailable: meetingBotAvailable(),
    recordsInterviews: org?.recordsInterviews ?? false,
  };
}
