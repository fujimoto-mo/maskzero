"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ANCHORS,
  DEFAULT_TIMING,
  EVENT_TIMINGS,
  TIMINGS,
  type TemplateProblem,
  timingsFor,
  TRIGGERS,
  validateTemplate,
} from "@/features/scheduling/templates";
import { recordAudit } from "@/server/audit";
import { isAdmin, type MemberCtx, requireMember } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { customMessages, messageTemplates, organizations } from "@/server/db/schema";

const path = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}/settings`;

async function requireAdmin(orgSlug: string, clientSlug: string) {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isAdmin(ctx)) throw new Error("This action needs owner or admin rights.");
  return ctx;
}

/** Client-specific wording exists only for agencies; in-house companies have one client. */
const clientOf = (ctx: MemberCtx, scope: "org" | "client") =>
  scope === "client" && ctx.orgKind === "agency" ? ctx.clientId : null;

const templateSchema = z.object({
  trigger: z.enum(TRIGGERS),
  scope: z.enum(["org", "client"]),
  enabled: z.boolean(),
  timing: z.enum(TIMINGS).nullable(),
  subject: z.string().trim().max(200),
  body: z.string().trim().max(5000),
});

/** Saves the wording and timing for one trigger (docs/02 M9-3); unknown {fields} are refused. */
export async function saveTemplateAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof templateSchema>,
): Promise<{ ok: true } | { ok: false; problems: TemplateProblem[] }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, problems: [{ code: "empty" }] };
  const { trigger, enabled, subject, body } = parsed.data;
  // Only triggers with a configurable time keep one, and only event-relative timings.
  const timing =
    DEFAULT_TIMING[trigger] && parsed.data.timing && EVENT_TIMINGS.includes(parsed.data.timing)
      ? parsed.data.timing
      : null;
  const problems = validateTemplate(trigger, { subject, body });
  if (problems.length > 0) return { ok: false, problems };
  const clientId = clientOf(ctx, parsed.data.scope);
  await withRls(ctx, async (tx) => {
    const values = { enabled, timing, subject, body, updatedBy: ctx.userId };
    const insert = tx
      .insert(messageTemplates)
      .values({ orgId: ctx.orgId, clientId, trigger, ...values });
    await (clientId
      ? insert.onConflictDoUpdate({
          target: [messageTemplates.clientId, messageTemplates.trigger],
          targetWhere: sql`${messageTemplates.clientId} is not null`,
          set: values,
        })
      : insert.onConflictDoUpdate({
          target: [messageTemplates.orgId, messageTemplates.trigger],
          targetWhere: sql`${messageTemplates.clientId} is null`,
          set: values,
        }));
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.template_updated",
      targetType: "message_template",
      meta: { trigger, enabled, timing, client: Boolean(clientId) },
    });
  });
  revalidatePath(path(ctx));
  return { ok: true };
}

/** Back to the inherited wording: the company default for a client, ours for the company. */
export async function resetTemplateAction(
  orgSlug: string,
  clientSlug: string,
  trigger: (typeof TRIGGERS)[number],
  scope: "org" | "client",
): Promise<void> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  z.enum(TRIGGERS).parse(trigger);
  const clientId = clientOf(ctx, z.enum(["org", "client"]).parse(scope));
  await withRls(ctx, async (tx) => {
    await tx
      .delete(messageTemplates)
      .where(
        and(
          eq(messageTemplates.orgId, ctx.orgId),
          eq(messageTemplates.trigger, trigger),
          clientId ? eq(messageTemplates.clientId, clientId) : isNull(messageTemplates.clientId),
        ),
      );
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.template_reset",
      targetType: "message_template",
      meta: { trigger, client: Boolean(clientId) },
    });
  });
  revalidatePath(path(ctx));
}

const customSchema = z.object({
  id: z.uuid().optional(),
  scope: z.enum(["org", "client"]),
  name: z.string().trim().min(1).max(60),
  anchor: z.enum(ANCHORS),
  timing: z.enum(TIMINGS),
  enabled: z.boolean(),
  subject: z.string().trim().max(200),
  body: z.string().trim().max(5000),
});

/** Creates or updates a custom email: what it follows, when, and its wording (M9-2). */
export async function saveCustomMessageAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof customSchema>,
): Promise<{ ok: true } | { ok: false; problems: TemplateProblem[] }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  const parsed = customSchema.safeParse(input);
  if (!parsed.success || !timingsFor(parsed.data.anchor).includes(parsed.data.timing)) {
    return { ok: false, problems: [{ code: "empty" }] };
  }
  const { id, name, anchor, timing, enabled, subject, body } = parsed.data;
  const problems = validateTemplate(null, { subject, body });
  if (problems.length > 0) return { ok: false, problems };
  const clientId = clientOf(ctx, parsed.data.scope);
  const values = { name, anchor, timing, enabled, subject, body, updatedBy: ctx.userId };
  await withRls(ctx, async (tx) => {
    const [row] = id
      ? await tx
          .update(customMessages)
          .set(values)
          .where(and(eq(customMessages.id, id), eq(customMessages.orgId, ctx.orgId)))
          .returning({ id: customMessages.id })
      : await tx
          .insert(customMessages)
          .values({ orgId: ctx.orgId, clientId, ...values })
          .returning({ id: customMessages.id });
    if (!row) return;
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: id ? "settings.custom_message_updated" : "settings.custom_message_created",
      targetType: "custom_message",
      targetId: row.id,
      meta: { anchor, timing, enabled },
    });
  });
  revalidatePath(path(ctx));
  return { ok: true };
}

export async function deleteCustomMessageAction(
  orgSlug: string,
  clientSlug: string,
  id: string,
): Promise<void> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  z.uuid().parse(id);
  await withRls(ctx, async (tx) => {
    const removed = await tx
      .delete(customMessages)
      .where(and(eq(customMessages.id, id), eq(customMessages.orgId, ctx.orgId)))
      .returning({ id: customMessages.id });
    if (removed.length === 0) return;
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.custom_message_deleted",
      targetType: "custom_message",
      targetId: id,
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
