"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TRIGGERS, type TemplateProblem, validateTemplate } from "@/features/scheduling/templates";
import { recordAudit } from "@/server/audit";
import { isAdmin, type MemberCtx, requireMember } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { messageTemplates, organizations } from "@/server/db/schema";

const path = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}/settings`;

async function requireAdmin(orgSlug: string, clientSlug: string) {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isAdmin(ctx)) throw new Error("This action needs owner or admin rights.");
  return ctx;
}

const templateSchema = z.object({
  trigger: z.enum(TRIGGERS),
  enabled: z.boolean(),
  subject: z.string().trim().max(200),
  body: z.string().trim().max(5000),
});

/** Saves the company's wording for one trigger (docs/02 M9-3); unknown {fields} are refused. */
export async function saveTemplateAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof templateSchema>,
): Promise<{ ok: true } | { ok: false; problems: TemplateProblem[] }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problems: [{ code: "empty" }] };
  const { trigger, enabled, subject, body } = parsed.data;
  const problems = validateTemplate(trigger, { subject, body });
  if (problems.length > 0) return { ok: false, problems };
  await withRls(ctx, async (tx) => {
    await tx
      .insert(messageTemplates)
      .values({ orgId: ctx.orgId, trigger, enabled, subject, body, updatedBy: ctx.userId })
      .onConflictDoUpdate({
        target: [messageTemplates.orgId, messageTemplates.trigger],
        targetWhere: sql`${messageTemplates.clientId} is null`,
        set: { enabled, subject, body, updatedBy: ctx.userId },
      });
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.template_updated",
      targetType: "message_template",
      meta: { trigger, enabled },
    });
  });
  revalidatePath(path(ctx));
  return { ok: true };
}

/** Back to the shipped default wording. */
export async function resetTemplateAction(
  orgSlug: string,
  clientSlug: string,
  trigger: (typeof TRIGGERS)[number],
): Promise<void> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  z.enum(TRIGGERS).parse(trigger);
  await withRls(ctx, async (tx) => {
    await tx
      .delete(messageTemplates)
      .where(
        and(
          eq(messageTemplates.orgId, ctx.orgId),
          eq(messageTemplates.trigger, trigger),
          isNull(messageTemplates.clientId),
        ),
      );
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.template_reset",
      targetType: "message_template",
      meta: { trigger },
    });
  });
  revalidatePath(path(ctx));
}

/** Test mode records every email in the send log without delivering it (docs/02 M9-6). */
export async function setTestModeAction(
  orgSlug: string,
  clientSlug: string,
  on: boolean,
): Promise<void> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  await withRls(ctx, async (tx) => {
    await tx.update(organizations).set({ testMode: on }).where(eq(organizations.id, ctx.orgId));
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: on ? "settings.test_mode_on" : "settings.test_mode_off",
      targetType: "organization",
      targetId: ctx.orgId,
    });
  });
  revalidatePath(path(ctx));
}
