import "server-only";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { getPublicEnv } from "@/lib/env";
import type { MemberCtx } from "@/server/auth/session";
import { decryptOptional } from "@/server/crypto/pii";
import { withRls } from "@/server/db/rls";
import {
  applications,
  candidates,
  clients,
  entryUrls,
  entryWaits,
  inboundEmails,
  jobs,
  organizations,
} from "@/server/db/schema";
import { inboundAddress } from "@/server/inbound/address";
import { DEFAULT_NUDGE } from "./nudge";

export type WaitRow = {
  id: string;
  applicantName: string;
  channel: string;
  jobTitle: string;
  notifiedAt: string;
  /** The entry URL for this job and board, if one is issued and on. */
  entryUrl: string | null;
};

/** "Not yet entered" (docs/02 M3-11): board applicants of this client still to enter. */
export async function listWaits(
  ctx: MemberCtx,
): Promise<{ rows: WaitRow[]; nudgeTemplate: string }> {
  return withRls(ctx, async (tx) => {
    const [rows, [org]] = await Promise.all([
      tx
        .select({
          id: entryWaits.id,
          applicantName: entryWaits.applicantName,
          channel: entryWaits.channel,
          jobTitle: jobs.title,
          notifiedAt: entryWaits.notifiedAt,
          code: entryUrls.code,
        })
        .from(entryWaits)
        .innerJoin(jobs, eq(jobs.id, entryWaits.jobId))
        .leftJoin(
          entryUrls,
          and(
            eq(entryUrls.jobId, entryWaits.jobId),
            eq(entryUrls.channel, entryWaits.channel),
            eq(entryUrls.enabled, true),
          ),
        )
        .where(
          and(
            eq(entryWaits.orgId, ctx.orgId),
            eq(entryWaits.clientId, ctx.clientId),
            eq(entryWaits.status, "open"),
          ),
        )
        .orderBy(desc(entryWaits.notifiedAt))
        .limit(200),
      tx
        .select({ nudge: organizations.nudgeMsgTemplate })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId)),
    ]);
    const appUrl = getPublicEnv().appUrl;
    return {
      rows: rows.map((r) => ({
        id: r.id,
        applicantName: r.applicantName,
        channel: r.channel,
        jobTitle: r.jobTitle,
        notifiedAt: r.notifiedAt.toISOString(),
        entryUrl: r.code ? `${appUrl}/a/${r.code}` : null,
      })),
      nudgeTemplate: org?.nudge || DEFAULT_NUDGE,
    };
  });
}

export async function countOpenWaits(ctx: MemberCtx): Promise<number> {
  const [row] = await withRls(ctx, (tx) =>
    tx
      .select({ n: count() })
      .from(entryWaits)
      .where(
        and(
          eq(entryWaits.orgId, ctx.orgId),
          eq(entryWaits.clientId, ctx.clientId),
          eq(entryWaits.status, "open"),
        ),
      ),
  );
  return row?.n ?? 0;
}

export type ReplyRow = {
  id: string;
  applicationId: string;
  candidateName: string;
  subject: string;
  body: string;
  receivedAt: string;
  read: boolean;
};

/** Candidates' replies to this client's emails (docs/02 M3-10), newest first. */
export async function listReplies(ctx: MemberCtx): Promise<ReplyRow[]> {
  const rows = await withRls(ctx, (tx) =>
    tx
      .select({
        id: inboundEmails.id,
        applicationId: inboundEmails.applicationId,
        candidateName: candidates.name,
        subjectEnc: inboundEmails.subjectEnc,
        bodyEnc: inboundEmails.bodyEnc,
        receivedAt: inboundEmails.receivedAt,
        readAt: inboundEmails.readAt,
      })
      .from(inboundEmails)
      .innerJoin(applications, eq(applications.id, inboundEmails.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .where(
        and(
          eq(inboundEmails.orgId, ctx.orgId),
          eq(inboundEmails.clientId, ctx.clientId),
          eq(inboundEmails.kind, "candidate_reply"),
        ),
      )
      .orderBy(desc(inboundEmails.receivedAt))
      .limit(100),
  );
  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId!,
    candidateName: r.candidateName,
    subject: decryptOptional(r.subjectEnc) ?? "",
    body: decryptOptional(r.bodyEnc) ?? "",
    receivedAt: r.receivedAt.toISOString(),
    read: r.readAt !== null,
  }));
}

export async function countUnreadReplies(ctx: MemberCtx): Promise<number> {
  const [row] = await withRls(ctx, (tx) =>
    tx
      .select({ n: count() })
      .from(inboundEmails)
      .where(
        and(
          eq(inboundEmails.orgId, ctx.orgId),
          eq(inboundEmails.clientId, ctx.clientId),
          eq(inboundEmails.kind, "candidate_reply"),
          isNull(inboundEmails.readAt),
        ),
      ),
  );
  return row?.n ?? 0;
}

export type InboundLogRow = {
  id: string;
  kind: (typeof inboundEmails.$inferSelect)["kind"];
  channel: string | null;
  clientName: string | null;
  subject: string;
  failure: string | null;
  receivedAt: string;
};

/** The inbound address and recent inbound mail, matched or not, for admins (docs/02 M3-10). */
export async function getInboundSettings(
  ctx: MemberCtx,
): Promise<{ address: string | null; configured: boolean; log: InboundLogRow[] }> {
  return withRls(ctx, async (tx) => {
    const [[org], rows] = await Promise.all([
      tx
        .select({ local: organizations.inboundLocalPart })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId)),
      tx
        .select({
          id: inboundEmails.id,
          kind: inboundEmails.kind,
          channel: inboundEmails.channel,
          clientName: clients.name,
          subjectEnc: inboundEmails.subjectEnc,
          parsed: inboundEmails.parsed,
          receivedAt: inboundEmails.receivedAt,
        })
        .from(inboundEmails)
        .leftJoin(clients, eq(clients.id, inboundEmails.clientId))
        .where(eq(inboundEmails.orgId, ctx.orgId))
        .orderBy(desc(inboundEmails.receivedAt))
        .limit(50),
    ]);
    return {
      address: inboundAddress(org?.local ?? null),
      configured: Boolean(process.env.INBOUND_DOMAIN),
      log: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        channel: r.channel,
        clientName: r.clientName,
        subject: decryptOptional(r.subjectEnc) ?? "",
        failure: (r.parsed as { failure?: string }).failure ?? null,
        receivedAt: r.receivedAt.toISOString(),
      })),
    };
  });
}
