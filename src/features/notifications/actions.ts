"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listCandidates } from "@/features/candidates/queries";
import { requireMember } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { notificationSettings, profiles } from "@/server/db/schema";
import { EMAIL_NOTIFICATION_KINDS } from "./kinds";

export async function markNotificationsReadAction(
  orgSlug: string,
  clientSlug: string,
): Promise<void> {
  const ctx = await requireMember(orgSlug, clientSlug);
  await withRls(ctx, (tx) =>
    tx
      .update(profiles)
      .set({ notificationsSeenAt: sql`now()` })
      .where(eq(profiles.id, ctx.userId)),
  );
  revalidatePath(`/app/${ctx.orgSlug}/${ctx.clientSlug}`, "layout");
}

/** ⌘K search (docs/02 M6-5): candidates by name, or exactly by email address. */
export async function searchCandidatesAction(
  orgSlug: string,
  clientSlug: string,
  query: string,
): Promise<{ applicationId: string; name: string; jobTitle: string; stage: string }[]> {
  const ctx = await requireMember(orgSlug, clientSlug);
  const q = query.trim().slice(0, 100);
  if (!q) return [];
  const { rows } = await listCandidates(ctx, { group: "all", q });
  return rows.slice(0, 10).map((r) => ({
    applicationId: r.applicationId,
    name: r.name,
    jobTitle: r.jobTitle,
    stage: r.stage,
  }));
}

/** Which notifications this member also gets by email (docs/02 M6-4). */
export async function saveNotificationPrefsAction(
  orgSlug: string,
  clientSlug: string,
  kinds: string[],
): Promise<{ ok: boolean }> {
  const ctx = await requireMember(orgSlug, clientSlug);
  const parsed = z.array(z.enum(EMAIL_NOTIFICATION_KINDS)).max(20).safeParse(kinds);
  if (!parsed.success) return { ok: false };
  const emailKinds = [...new Set(parsed.data)];
  await withRls(ctx, (tx) =>
    tx
      .insert(notificationSettings)
      .values({ orgId: ctx.orgId, userId: ctx.userId, emailKinds })
      .onConflictDoUpdate({
        target: [notificationSettings.orgId, notificationSettings.userId],
        set: { emailKinds },
      }),
  );
  revalidatePath(`/app/${ctx.orgSlug}/${ctx.clientSlug}/settings`);
  return { ok: true };
}
