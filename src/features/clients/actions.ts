"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { isAdmin, type MemberCtx, requireMember } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { clients } from "@/server/db/schema";
import { checkPlanLimit } from "@/features/billing/limits";

const layoutPath = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

async function requireAgencyAdmin(orgSlug: string, clientSlug: string) {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isAdmin(ctx) || ctx.orgKind !== "agency") {
    throw new Error("Clients are managed by owners and admins of an agency.");
  }
  return ctx;
}

/** Lowercase letters, digits and hyphens; it becomes part of every URL of the client. */
const CLIENT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

const clientSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().toLowerCase().regex(CLIENT_SLUG_PATTERN),
});

export type ClientResult = { ok: true } | { ok: false; error: "invalid" | "taken" | "limit" };

/** Adds a client company (docs/02 M1-1); owners and admins only, within the plan's limit. */
export async function createClientAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof clientSchema>,
): Promise<ClientResult> {
  const ctx = await requireAgencyAdmin(orgSlug, clientSlug);
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const result = await withRls(ctx, async (tx): Promise<ClientResult> => {
    if (!(await checkPlanLimit(tx, ctx.orgId, "clients"))) return { ok: false, error: "limit" };
    const [created] = await tx
      .insert(clients)
      .values({ orgId: ctx.orgId, name: parsed.data.name, slug: parsed.data.slug })
      .onConflictDoNothing()
      .returning({ id: clients.id });
    if (!created) return { ok: false, error: "taken" };
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "client.created",
      targetType: "client",
      targetId: created.id,
    });
    return { ok: true };
  });
  if (result.ok) revalidatePath(layoutPath(ctx), "layout");
  return result;
}

/** Renames a client; the URL (slug) stays, so shared links keep working. */
export async function renameClientAction(
  orgSlug: string,
  clientSlug: string,
  clientId: string,
  name: string,
): Promise<ClientResult> {
  const ctx = await requireAgencyAdmin(orgSlug, clientSlug);
  const id = z.uuid().parse(clientId);
  const parsed = clientSchema.shape.name.safeParse(name);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const ok = await withRls(ctx, async (tx) => {
    const [updated] = await tx
      .update(clients)
      .set({ name: parsed.data })
      .where(and(eq(clients.id, id), eq(clients.orgId, ctx.orgId)))
      .returning({ id: clients.id });
    if (!updated) return false;
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "client.renamed",
      targetType: "client",
      targetId: id,
    });
    return true;
  });
  if (ok) revalidatePath(layoutPath(ctx), "layout");
  return ok ? { ok: true } : { ok: false, error: "invalid" };
}
