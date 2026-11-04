"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type MemberCtx, requireEditor } from "@/server/auth/session";
import { getAdminDb } from "@/server/db/admin";
import { withRls } from "@/server/db/rls";
import { capabilities, GOOGLE_CALENDAR_ID, toolAvailable } from "@/features/integrations/domain";
import {
  availabilityRules,
  calendars,
  concernOptions,
  integrations,
  slotOverrides,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { ensureCalendar, toEngineRules } from "./server";
import { jstDateKey, ruleSlotsOn } from "./slots";

const path = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}/scheduling`;
const scopeOf = (ctx: MemberCtx) => ({ orgId: ctx.orgId, clientId: ctx.clientId });

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dayHours = z.object({ on: z.boolean(), from: hhmm, to: hhmm });

const rulesSchema = z
  .object({
    weekly: z.partialRecord(z.enum(["0", "1", "2", "3", "4", "5", "6"]), dayHours),
    commonFrom: hhmm,
    commonTo: hhmm,
    slotMinutes: z.number().int().min(15).max(240),
    laterRoundMinutes: z.number().int().min(15).max(240),
    bufferMinutes: z.number().int().min(0).max(120),
    excludeWeekends: z.boolean(),
    excludeHolidays: z.boolean(),
    windowDays: z.number().int().min(1).max(180),
    minNoticeHours: z.number().int().min(0).max(336),
    cancelCutoffHours: z.number().int().min(0).max(336),
    confirmMode: z.enum(["auto", "manual"]),
    tool: z.enum(["url", "onsite", "meet", "zoom", "teams"]),
    fixedMeetingUrl: z.union([z.literal(""), z.url().max(500)]),
    onsiteAddress: z.string().trim().max(200),
    /** null: not linked to Google; "" or "primary": the account's main calendar (M8-6). */
    googleCalendarId: z.union([
      z.null(),
      z.literal(""),
      z.string().trim().regex(GOOGLE_CALENDAR_ID),
    ]),
  })
  .refine((r) => r.commonFrom < r.commonTo, { path: ["commonTo"] })
  .refine((r) => r.tool !== "url" || r.fixedMeetingUrl !== "", { path: ["fixedMeetingUrl"] })
  .refine((r) => r.tool !== "onsite" || r.onsiteAddress !== "", { path: ["onsiteAddress"] });

export type RulesInput = z.input<typeof rulesSchema>;

/** Availability rules of the client's shared calendar (docs/02 M8-1, M8-6). */
export async function saveRulesAction(
  orgSlug: string,
  clientSlug: string,
  input: RulesInput,
): Promise<{ ok: true } | { ok: false; field: string | null }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const parsed = rulesSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, field: String(parsed.error.issues[0]?.path[0] ?? "") || null };
  const { fixedMeetingUrl, onsiteAddress, googleCalendarId, ...rest } = parsed.data;
  const { calendarId } = await ensureCalendar(getAdminDb(), scopeOf(ctx));
  return withRls(ctx, async (tx) => {
    // Meet, Zoom, Teams and the Google calendar need their account connected (設定 → 連携).
    if ((rest.tool !== "url" && rest.tool !== "onsite") || googleCalendarId !== null) {
      const can = capabilities(
        await tx
          .select({
            provider: integrations.provider,
            scopes: integrations.scopes,
            status: integrations.status,
          })
          .from(integrations)
          .where(eq(integrations.orgId, ctx.orgId)),
      );
      if (!toolAvailable(rest.tool, can)) return { ok: false, field: "tool" } as const;
      if (googleCalendarId !== null && !can.googleCalendar) {
        return { ok: false, field: "googleCalendarId" } as const;
      }
    }
    await tx
      .update(calendars)
      .set({ googleCalendarId: googleCalendarId === null ? null : googleCalendarId || "primary" })
      .where(and(eq(calendars.id, calendarId), eq(calendars.clientId, ctx.clientId)));
    await tx
      .update(availabilityRules)
      .set({
        ...rest,
        fixedMeetingUrl: fixedMeetingUrl || null,
        onsiteAddress: onsiteAddress || null,
      })
      .where(
        and(
          eq(availabilityRules.calendarId, calendarId),
          eq(availabilityRules.clientId, ctx.clientId),
        ),
      );
    await recordEvent(tx, {
      ...scopeOf(ctx),
      actor: "staff",
      actorId: ctx.userId,
      type: "scheduling.rules_updated",
      payload: { calendarId },
    });
    revalidatePath(path(ctx));
    return { ok: true } as const;
  });
}

/**
 * Opens or closes one slot on the month calendar (M8-2). A slot set back to what the rules say
 * loses its override, so the rules keep applying if they change later.
 */
export async function toggleSlotAction(
  orgSlug: string,
  clientSlug: string,
  startsAtIso: string,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const startsAt = new Date(z.iso.datetime({ offset: true }).parse(startsAtIso));
  // Finished days stay as they were.
  if (jstDateKey(startsAt) < jstDateKey(new Date())) return;
  const { calendarId, rules } = await ensureCalendar(getAdminDb(), scopeOf(ctx));
  const ruleOpen = ruleSlotsOn(toEngineRules(rules), jstDateKey(startsAt)).some(
    (s) => s.startsAt.getTime() === startsAt.getTime(),
  );
  await withRls(ctx, async (tx) => {
    const [existing] = await tx
      .select({ open: slotOverrides.open })
      .from(slotOverrides)
      .where(and(eq(slotOverrides.calendarId, calendarId), eq(slotOverrides.startsAt, startsAt)));
    const open = !(existing?.open ?? ruleOpen);
    if (open === ruleOpen) {
      await tx
        .delete(slotOverrides)
        .where(and(eq(slotOverrides.calendarId, calendarId), eq(slotOverrides.startsAt, startsAt)));
    } else {
      await tx
        .insert(slotOverrides)
        .values({ ...scopeOf(ctx), calendarId, startsAt, open })
        .onConflictDoUpdate({
          target: [slotOverrides.calendarId, slotOverrides.startsAt],
          set: { open },
        });
    }
  });
  revalidatePath(path(ctx));
}

const concernsSchema = z
  .array(
    z.object({
      id: z.string().max(64).optional(),
      label: z.string().trim().min(1).max(60),
      answer: z.string().trim().min(1).max(1000),
    }),
  )
  .max(20);

/** "Concerns" shown on the booking page with the company's answers (M8-3). */
export async function saveConcernsAction(
  orgSlug: string,
  clientSlug: string,
  items: z.input<typeof concernsSchema>,
): Promise<{ ok: boolean }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const parsed = concernsSchema.safeParse(items);
  if (!parsed.success) return { ok: false };
  await withRls(ctx, async (tx) => {
    const existing = new Set(
      (
        await tx
          .select({ id: concernOptions.id })
          .from(concernOptions)
          .where(eq(concernOptions.clientId, ctx.clientId))
      ).map((r) => r.id),
    );
    const kept = parsed.data.flatMap((c) => (c.id && existing.has(c.id) ? [c.id] : []));
    await tx
      .delete(concernOptions)
      .where(
        kept.length
          ? and(eq(concernOptions.clientId, ctx.clientId), notInArray(concernOptions.id, kept))
          : eq(concernOptions.clientId, ctx.clientId),
      );
    for (const [position, item] of parsed.data.entries()) {
      if (item.id && existing.has(item.id)) {
        await tx
          .update(concernOptions)
          .set({ label: item.label, answer: item.answer, position })
          .where(
            and(eq(concernOptions.id, item.id), inArray(concernOptions.clientId, [ctx.clientId])),
          );
      } else {
        await tx
          .insert(concernOptions)
          .values({ ...scopeOf(ctx), label: item.label, answer: item.answer, position });
      }
    }
  });
  revalidatePath(path(ctx));
  return { ok: true };
}
