"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { normalizeEmail } from "@/lib/contact";
import { getPublicEnv } from "@/lib/env";
import { recordAudit } from "@/server/audit";
import { isAdmin, type MemberCtx, requireMember } from "@/server/auth/session";
import { hashPii } from "@/server/crypto/pii";
import { newToken, sha256 } from "@/server/crypto/tokens";
import { withRls } from "@/server/db/rls";
import {
  candidates,
  dataRequests,
  invitations,
  memberships,
  organizations,
  profiles,
} from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { createSupabaseServerClient } from "@/server/supabase/server";

const settingsPath = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}/settings`;

async function requireAdmin(orgSlug: string, clientSlug: string) {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isAdmin(ctx)) throw new Error("This action needs owner or admin rights.");
  return ctx;
}

const companySchema = z.object({
  name: z.string().trim().min(1).max(100),
  senderName: z.string().trim().max(50),
  replyTo: z.union([z.literal(""), z.email().max(254)]),
  retentionDays: z.number().int().min(30).max(730),
});

/** Company name, email sender name, reply-to and document retention (docs/01 §5.7, M13-2). */
export async function saveCompanyAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof companySchema>,
): Promise<{ ok: boolean }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { name, senderName, replyTo, retentionDays } = parsed.data;
  await withRls(ctx, async (tx) => {
    await tx
      .update(organizations)
      .set({
        name,
        senderName: senderName || null,
        replyTo: replyTo || null,
        docRetentionDays: retentionDays,
      })
      .where(eq(organizations.id, ctx.orgId));
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "settings.company_updated",
      targetType: "organization",
      targetId: ctx.orgId,
      meta: { retentionDays },
    });
  });
  revalidatePath(`/app/${ctx.orgSlug}`, "layout");
  return { ok: true };
}

const INVITE_DAYS = 7;
const inviteSchema = z.object({
  email: z.email().max(254),
  role: z.enum(["admin", "recruiter", "interviewer", "viewer"]),
});

/**
 * Invites a member by email (docs/02 M1-3). The link is also returned once, so the admin can pass
 * it on when email doesn't arrive.
 */
export async function inviteMemberAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof inviteSchema>,
): Promise<{ ok: true; link: string } | { ok: false; error: "invalid" | "member" }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const email = normalizeEmail(parsed.data.email);
  const token = newToken();

  const created = await withRls(ctx, async (tx) => {
    const [existing] = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(profiles, eq(profiles.id, memberships.userId))
      .where(and(eq(memberships.orgId, ctx.orgId), sql`lower(${profiles.email}) = ${email}`));
    if (existing) return false;
    // A new invitation replaces any earlier unused one for the same address.
    await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.orgId, ctx.orgId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
        ),
      );
    const [invitation] = await tx
      .insert(invitations)
      .values({
        orgId: ctx.orgId,
        email,
        role: parsed.data.role,
        tokenHash: sha256(token),
        invitedBy: ctx.userId,
        expiresAt: sql`now() + make_interval(days => ${INVITE_DAYS})`,
      })
      .returning({ id: invitations.id });
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "invitation.created",
      targetType: "invitation",
      targetId: invitation!.id,
      meta: { role: parsed.data.role },
    });
    return true;
  });
  if (!created) return { ok: false, error: "member" };

  const link = `${getPublicEnv().appUrl}/invite/${token}`;
  try {
    await sendEmail({
      to: email,
      subject: `【mask0】${ctx.orgName}への招待`,
      text: [
        `${ctx.orgName}の採用管理（mask0）に招待されました。`,
        "次のリンクを開き、このメールアドレスでログインまたは新規登録すると参加できます。",
        link,
        "",
        `このリンクの有効期限は${INVITE_DAYS}日です。お心当たりのない場合は、このメールを破棄してください。`,
      ].join("\n"),
    });
  } catch (error) {
    console.error("[invite] email failed", error instanceof Error ? error.message : error);
  }
  revalidatePath(settingsPath(ctx));
  return { ok: true, link };
}

export async function revokeInvitationAction(
  orgSlug: string,
  clientSlug: string,
  invitationId: string,
): Promise<void> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  z.uuid().parse(invitationId);
  await withRls(ctx, async (tx) => {
    const removed = await tx
      .delete(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.orgId, ctx.orgId)))
      .returning({ id: invitations.id });
    if (removed.length === 0) return;
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "invitation.revoked",
      targetType: "invitation",
      targetId: invitationId,
    });
  });
  revalidatePath(settingsPath(ctx));
}

/** Removes a member (never the owner, never yourself). */
export async function removeMemberAction(
  orgSlug: string,
  clientSlug: string,
  userId: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  z.uuid().parse(userId);
  if (userId === ctx.userId) return { ok: false };
  const ok = await withRls(ctx, async (tx) => {
    const removed = await tx
      .delete(memberships)
      .where(
        and(
          eq(memberships.orgId, ctx.orgId),
          eq(memberships.userId, userId),
          ne(memberships.role, "owner"),
        ),
      )
      .returning({ role: memberships.role });
    if (removed.length === 0) return false;
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "member.removed",
      targetType: "user",
      targetId: userId,
      meta: { role: removed[0]!.role },
    });
    return true;
  });
  revalidatePath(settingsPath(ctx));
  return { ok };
}

const requestSchema = z.object({
  kind: z.enum(["disclosure", "correction", "deletion"]),
  candidateName: z.string().trim().min(1).max(50),
  email: z.union([z.literal(""), z.email().max(254)]),
  note: z.string().trim().max(500),
});

/** Records a disclosure, correction or deletion request from a candidate (docs/02 M13-2). */
export async function createDataRequestAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof requestSchema>,
): Promise<{ ok: boolean }> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { kind, candidateName, email, note } = parsed.data;
  await withRls(ctx, async (tx) => {
    const [candidate] = email
      ? await tx
          .select({ id: candidates.id })
          .from(candidates)
          .where(
            and(
              eq(candidates.orgId, ctx.orgId),
              eq(candidates.emailHash, hashPii("email", normalizeEmail(email))),
            ),
          )
      : [];
    const [request] = await tx
      .insert(dataRequests)
      .values({
        orgId: ctx.orgId,
        candidateId: candidate?.id ?? null,
        candidateName,
        kind,
        note: note || null,
      })
      .returning({ id: dataRequests.id });
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "data_request.created",
      targetType: "data_request",
      targetId: request!.id,
      meta: { kind, linked: Boolean(candidate) },
    });
  });
  revalidatePath(settingsPath(ctx));
  return { ok: true };
}

export async function updateDataRequestAction(
  orgSlug: string,
  clientSlug: string,
  requestId: string,
  status: "done" | "rejected",
): Promise<void> {
  const ctx = await requireAdmin(orgSlug, clientSlug);
  z.uuid().parse(requestId);
  await withRls(ctx, async (tx) => {
    await tx
      .update(dataRequests)
      .set({ status, completedAt: sql`now()`, handledBy: ctx.userId })
      .where(and(eq(dataRequests.id, requestId), eq(dataRequests.orgId, ctx.orgId)));
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "data_request.closed",
      targetType: "data_request",
      targetId: requestId,
      meta: { status },
    });
  });
  revalidatePath(settingsPath(ctx));
}

export async function updateProfileAction(
  orgSlug: string,
  clientSlug: string,
  name: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireMember(orgSlug, clientSlug);
  const parsed = z.string().trim().max(50).safeParse(name);
  if (!parsed.success) return { ok: false };
  await withRls(ctx, (tx) =>
    tx
      .update(profiles)
      .set({ name: parsed.data || null })
      .where(eq(profiles.id, ctx.userId)),
  );
  revalidatePath(`/app/${ctx.orgSlug}`, "layout");
  return { ok: true };
}

/** Signs this user out on every device (docs/02 M1-6). */
export async function signOutEverywhereAction(orgSlug: string, clientSlug: string): Promise<void> {
  const ctx = await requireMember(orgSlug, clientSlug);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope: "global" });
  await withRls(ctx, (tx) =>
    recordAudit(tx, { orgId: ctx.orgId, userId: ctx.userId, action: "auth.signed_out_everywhere" }),
  ).catch(() => undefined);
  redirect("/login");
}
