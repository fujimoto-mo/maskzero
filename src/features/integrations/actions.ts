"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { isAdmin, type MemberCtx, requireMember } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { integrations, organizations } from "@/server/db/schema";
import { capabilities } from "./domain";

const settingsPath = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}/settings`;

async function requireAdmin(orgSlug: string, clientSlug: string) {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isAdmin(ctx)) throw new Error("This action needs owner or admin rights.");
  return ctx;
}

/**
 * Disconnects an account (docs/02 M8-6, M9-4). Interviews already booked keep their links; new
 * ones fall back as the tools allow, and emails go from mask0's sender again.
 */
export async function disconnectAction(
  orgSlug: string,
  clientSlug: string,
  provider: "google" | "zoom" | "microsoft",
): Promise<{ ok: boolean }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  if (!["google", "zoom", "microsoft"].includes(provider)) return { ok: false };
  await withRls(ctx, async (tx) => {
    await tx
      .delete(integrations)
      .where(and(eq(integrations.orgId, ctx.orgId), eq(integrations.provider, provider)));
    if (provider === "google") {
      await tx
        .update(organizations)
        .set({ emailVia: "mask0" })
        .where(eq(organizations.id, ctx.orgId));
    }
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "integration.disconnected",
      targetType: "integration",
      meta: { provider },
    });
  });
  revalidatePath(settingsPath(ctx));
  return { ok: true };
}

const settingsSchema = z.object({
  emailVia: z.enum(["mask0", "gmail"]),
  botName: z.string().trim().max(40),
});

/** The sender of candidate emails and the meeting bot's name (docs/02 M9-4, M11-5). */
export async function saveIntegrationSettingsAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof settingsSchema>,
): Promise<{ ok: true } | { ok: false; error: "invalid" | "gmail" }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { emailVia, botName } = parsed.data;
  return withRls(ctx, async (tx) => {
    if (emailVia === "gmail") {
      const rows = await tx
        .select({
          provider: integrations.provider,
          scopes: integrations.scopes,
          status: integrations.status,
        })
        .from(integrations)
        .where(eq(integrations.orgId, ctx.orgId));
      if (!capabilities(rows).gmail) return { ok: false, error: "gmail" } as const;
    }
    await tx
      .update(organizations)
      .set({ emailVia, botName: botName || null })
      .where(eq(organizations.id, ctx.orgId));
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.integrations_updated",
      meta: { emailVia },
    });
    revalidatePath(settingsPath(ctx));
    return { ok: true } as const;
  });
}
