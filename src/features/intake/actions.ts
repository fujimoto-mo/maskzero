"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { isAdmin, type MemberCtx, requireEditor, requireMember } from "@/server/auth/session";
import { newEntryCode } from "@/server/crypto/tokens";
import { withRls } from "@/server/db/rls";
import { applications, entryUrls, jobs, organizations } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { normalizeChannel } from "./channels";
import { checkEntryTemplate, type TemplateProblem } from "./template";

const path = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}/entry-urls`;

const createInput = z.object({ jobId: z.uuid(), channel: z.string().max(100) });

export async function createEntryUrlAction(
  orgSlug: string,
  clientSlug: string,
  input: { jobId: string; channel: string },
): Promise<{ ok: true } | { ok: false; error: "invalid" | "duplicate" }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const parsed = createInput.safeParse(input);
  const channel = parsed.success ? normalizeChannel(parsed.data.channel) : null;
  if (!parsed.success || !channel) return { ok: false, error: "invalid" };
  const { jobId } = parsed.data;

  const result = await withRls(ctx, async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.orgId, ctx.orgId),
          eq(jobs.clientId, ctx.clientId),
          ne(jobs.status, "archived"),
        ),
      );
    if (!job) return "invalid" as const;
    const [created] = await tx
      .insert(entryUrls)
      .values({
        orgId: ctx.orgId,
        clientId: ctx.clientId,
        jobId,
        channel,
        code: newEntryCode(),
        createdBy: ctx.userId,
      })
      .onConflictDoNothing({ target: [entryUrls.jobId, entryUrls.channel] })
      .returning({ id: entryUrls.id });
    if (!created) return "duplicate" as const;
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      actor: "staff",
      actorId: ctx.userId,
      type: "entry_url.created",
      payload: { jobId, entryUrlId: created.id, channel },
    });
    return "ok" as const;
  });
  if (result !== "ok") return { ok: false, error: result };
  revalidatePath(path(ctx));
  return { ok: true };
}

export async function setEntryUrlEnabledAction(
  orgSlug: string,
  clientSlug: string,
  id: string,
  enabled: boolean,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  await withRls(ctx, async (tx) => {
    const updated = await tx
      .update(entryUrls)
      .set({ enabled })
      .where(
        and(
          eq(entryUrls.id, id),
          eq(entryUrls.orgId, ctx.orgId),
          eq(entryUrls.clientId, ctx.clientId),
        ),
      )
      .returning({ id: entryUrls.id });
    if (updated.length === 0) return;
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      actor: "staff",
      actorId: ctx.userId,
      type: enabled ? "entry_url.enabled" : "entry_url.disabled",
      payload: { entryUrlId: id },
    });
  });
  revalidatePath(path(ctx));
}

/** Removes an unused URL. One that brought in applicants is only switched off, to keep the trail. */
export async function deleteEntryUrlAction(
  orgSlug: string,
  clientSlug: string,
  id: string,
): Promise<{ ok: boolean; error?: "inUse" }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const result = await withRls(ctx, async (tx) => {
    const [used] = await tx
      .select({ n: count() })
      .from(applications)
      .where(eq(applications.entryUrlId, id));
    if ((used?.n ?? 0) > 0) return "inUse" as const;
    const removed = await tx
      .delete(entryUrls)
      .where(
        and(
          eq(entryUrls.id, id),
          eq(entryUrls.orgId, ctx.orgId),
          eq(entryUrls.clientId, ctx.clientId),
        ),
      )
      .returning({ id: entryUrls.id, jobId: entryUrls.jobId });
    if (removed[0]) {
      await recordEvent(tx, {
        orgId: ctx.orgId,
        clientId: ctx.clientId,
        actor: "staff",
        actorId: ctx.userId,
        type: "entry_url.deleted",
        payload: { entryUrlId: id, jobId: removed[0].jobId },
      });
    }
    return "ok" as const;
  });
  if (result !== "ok") return { ok: false, error: result };
  revalidatePath(path(ctx));
  return { ok: true };
}

/** The company-wide auto-reply template; owners and admins only (it is an org setting). */
export async function saveEntryTemplateAction(
  orgSlug: string,
  clientSlug: string,
  template: string,
): Promise<{ ok: true } | { ok: false; error: TemplateProblem | "forbidden" }> {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isAdmin(ctx)) return { ok: false, error: "forbidden" };
  const text = template.replace(/\r\n/g, "\n").trim();
  const problem = checkEntryTemplate(text);
  if (problem) return { ok: false, error: problem };
  await withRls(ctx, async (tx) => {
    await tx
      .update(organizations)
      .set({ entryMsgTemplate: text })
      .where(eq(organizations.id, ctx.orgId));
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.entry_template_updated",
      targetType: "organization",
      targetId: ctx.orgId,
    });
  });
  revalidatePath(path(ctx));
  return { ok: true };
}
