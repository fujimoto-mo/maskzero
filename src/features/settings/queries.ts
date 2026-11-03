import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import {
  aiUsage,
  auditLogs,
  dataRequests,
  invitations,
  memberships,
  organizations,
  profiles,
} from "@/server/db/schema";

export type CompanySettings = {
  name: string;
  senderName: string | null;
  replyTo: string | null;
  retentionDays: number;
};

export async function getCompanySettings(ctx: MemberCtx): Promise<CompanySettings> {
  const [org] = await withRls(ctx, (tx) =>
    tx
      .select({
        name: organizations.name,
        senderName: organizations.senderName,
        replyTo: organizations.replyTo,
        retentionDays: organizations.docRetentionDays,
      })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId)),
  );
  return org!;
}

export type MemberRow = {
  userId: string;
  name: string | null;
  email: string;
  role: (typeof memberships.$inferSelect)["role"];
  /** null = every client. */
  clientIds: string[] | null;
  lastLoginAt: string | null;
};

export type InvitationRow = {
  id: string;
  email: string;
  role: (typeof invitations.$inferSelect)["role"];
  clientIds: string[] | null;
  expiresAt: string;
};

export async function listMembers(
  ctx: MemberCtx,
): Promise<{ members: MemberRow[]; invitations: InvitationRow[] }> {
  return withRls(ctx, async (tx) => {
    const [members, pending] = await Promise.all([
      tx
        .select({
          userId: memberships.userId,
          name: profiles.name,
          email: profiles.email,
          role: memberships.role,
          clientIds: memberships.clientIds,
          lastLoginAt: profiles.lastLoginAt,
        })
        .from(memberships)
        .innerJoin(profiles, eq(profiles.id, memberships.userId))
        .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.status, "active")))
        .orderBy(memberships.createdAt),
      tx
        .select({
          id: invitations.id,
          email: invitations.email,
          role: invitations.role,
          clientIds: invitations.clientIds,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .where(
          and(
            eq(invitations.orgId, ctx.orgId),
            isNull(invitations.acceptedAt),
            gte(invitations.expiresAt, sql`now()`),
          ),
        )
        .orderBy(desc(invitations.createdAt)),
    ]);
    return {
      members: members.map((m) => ({ ...m, lastLoginAt: m.lastLoginAt?.toISOString() ?? null })),
      invitations: pending.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() })),
    };
  });
}

export type DataRequestRow = {
  id: string;
  candidateId: string | null;
  candidateName: string;
  kind: (typeof dataRequests.$inferSelect)["kind"];
  status: (typeof dataRequests.$inferSelect)["status"];
  note: string | null;
  requestedAt: string;
  completedAt: string | null;
};

export async function listDataRequests(ctx: MemberCtx): Promise<DataRequestRow[]> {
  const rows = await withRls(ctx, (tx) =>
    tx
      .select()
      .from(dataRequests)
      .where(eq(dataRequests.orgId, ctx.orgId))
      .orderBy(desc(dataRequests.requestedAt))
      .limit(100),
  );
  return rows.map((r) => ({
    id: r.id,
    candidateId: r.candidateId,
    candidateName: r.candidateName,
    kind: r.kind,
    status: r.status,
    note: r.note,
    requestedAt: r.requestedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));
}

export type AuditRow = {
  action: string;
  user: string | null;
  targetType: string | null;
  meta: Record<string, unknown>;
  at: string;
};

export async function listAuditLogs(ctx: MemberCtx): Promise<AuditRow[]> {
  const rows = await withRls(ctx, (tx) =>
    tx
      .select({
        action: auditLogs.action,
        name: profiles.name,
        email: profiles.email,
        targetType: auditLogs.targetType,
        meta: auditLogs.meta,
        at: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(profiles, eq(profiles.id, auditLogs.userId))
      .where(eq(auditLogs.orgId, ctx.orgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100),
  );
  return rows.map((r) => ({
    action: r.action,
    user: r.name ?? r.email ?? null,
    targetType: r.targetType,
    meta: (r.meta ?? {}) as Record<string, unknown>,
    at: r.at.toISOString(),
  }));
}

export type UsageRow = {
  feature: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** This month's AI use per feature (docs/02 M13-4: metering in P1, limits in P3). */
export async function getAiUsage(ctx: MemberCtx): Promise<UsageRow[]> {
  const rows = await withRls(ctx, (tx) =>
    tx
      .select({
        feature: aiUsage.feature,
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
        costUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float`,
      })
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.orgId, ctx.orgId),
          gte(
            aiUsage.createdAt,
            sql`date_trunc('month', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo'`,
          ),
        ),
      )
      .groupBy(aiUsage.feature),
  );
  return rows;
}

export async function getProfile(ctx: MemberCtx): Promise<{ name: string | null; email: string }> {
  const [profile] = await withRls(ctx, (tx) =>
    tx
      .select({ name: profiles.name, email: profiles.email })
      .from(profiles)
      .where(eq(profiles.id, ctx.userId)),
  );
  return profile ?? { name: null, email: ctx.email };
}
