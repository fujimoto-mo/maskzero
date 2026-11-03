"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { isAdmin, type MemberCtx, requireEditor, requireMember } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { entryWaits, inboundEmails, organizations } from "@/server/db/schema";
import { nudgeIsValid } from "./nudge";

const base = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

async function requireAdmin(orgSlug: string, clientSlug: string) {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isAdmin(ctx)) throw new Error("This action needs owner or admin rights.");
  return ctx;
}

/** Takes someone off the "not yet entered" list (applied elsewhere, a duplicate notice). */
export async function dismissWaitAction(
  orgSlug: string,
  clientSlug: string,
  waitId: string,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const id = z.uuid().parse(waitId);
  await withRls(ctx, (tx) =>
    tx
      .update(entryWaits)
      .set({ status: "dismissed" })
      .where(
        and(
          eq(entryWaits.id, id),
          eq(entryWaits.orgId, ctx.orgId),
          eq(entryWaits.clientId, ctx.clientId),
        ),
      ),
  );
  revalidatePath(`${base(ctx)}/screening/waiting`);
}

/** The company's nudge text; it must keep {URL} (docs/02 M3-11). */
export async function saveNudgeTemplateAction(
  orgSlug: string,
  clientSlug: string,
  text: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  const value = z.string().trim().max(1000).parse(text);
  if (!nudgeIsValid(value)) return { ok: false };
  await withRls(ctx, async (tx) => {
    await tx
      .update(organizations)
      .set({ nudgeMsgTemplate: value })
      .where(eq(organizations.id, ctx.orgId));
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.nudge_updated",
      targetType: "organization",
      targetId: ctx.orgId,
    });
  });
  revalidatePath(`${base(ctx)}/screening/waiting`);
  return { ok: true };
}

/** Marks a candidate's reply as read for everyone on the client. */
export async function markReplyReadAction(
  orgSlug: string,
  clientSlug: string,
  inboundEmailId: string,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const id = z.uuid().parse(inboundEmailId);
  await withRls(ctx, (tx) =>
    tx
      .update(inboundEmails)
      .set({ readAt: sql`now()`, readBy: ctx.userId })
      .where(
        and(
          eq(inboundEmails.id, id),
          eq(inboundEmails.orgId, ctx.orgId),
          eq(inboundEmails.clientId, ctx.clientId),
          isNull(inboundEmails.readAt),
        ),
      ),
  );
  revalidatePath(base(ctx), "layout");
}

/** Gives the company its inbound address (once; it never changes after that). */
export async function enableInboundAddressAction(
  orgSlug: string,
  clientSlug: string,
): Promise<void> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  await withRls(ctx, async (tx) => {
    const updated = await tx
      .update(organizations)
      .set({ inboundLocalPart: randomBytes(6).toString("hex") })
      .where(and(eq(organizations.id, ctx.orgId), isNull(organizations.inboundLocalPart)))
      .returning({ id: organizations.id });
    if (updated.length === 0) return;
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.inbound_enabled",
      targetType: "organization",
      targetId: ctx.orgId,
    });
  });
  revalidatePath(`${base(ctx)}/settings`);
}
