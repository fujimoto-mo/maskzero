"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizeChannel } from "@/features/intake/channels";
import {
  afterSchedulingChange,
  closeOpenScheduling,
  issueInvitation,
} from "@/features/interviews/server";
import { isPlausiblePhone } from "@/lib/contact";
import { recordAudit } from "@/server/audit";
import { isAdmin, type MemberCtx, requireEditor, requireMember } from "@/server/auth/session";
import { protectContact } from "@/server/crypto/pii";
import type { Tx } from "@/server/db/client";
import { withRls } from "@/server/db/rls";
import { applications, candidates, csvImports, documents, jobs } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { removeObjects } from "@/server/storage";
import { allowedChanges, type Outcome, type Stage, type StageChange } from "./stages";

const path = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

type NewApplicant = {
  name: string;
  email: string | null;
  phone: string | null;
  channel: string | null;
};

/**
 * Registers one applicant for a job (manual add or one CSV row). The same email in the org is the
 * same candidate; a candidate already on the job counts as a duplicate.
 */
async function addApplicant(
  tx: Tx,
  ctx: MemberCtx,
  jobId: string,
  source: "manual" | "csv",
  applicant: NewApplicant,
): Promise<"created" | "duplicate"> {
  const email = protectContact("email", applicant.email);
  const phone = protectContact("phone", applicant.phone);
  const [row] = await tx.execute<{ id: string }>(
    sql`select private.upsert_candidate(${ctx.orgId}, ${applicant.name}, ${email.enc}, ${email.hash}, ${phone.enc}, ${phone.hash}) as id`,
  );
  const [application] = await tx
    .insert(applications)
    .values({
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      jobId,
      candidateId: row!.id,
      channel: applicant.channel,
      source,
      // They applied on a job board; documents come when they open the entry URL.
      waitingOn: "candidate",
      nextAction: "request_documents",
    })
    .onConflictDoNothing({ target: [applications.jobId, applications.candidateId] })
    .returning({ id: applications.id });
  if (!application) return "duplicate";
  await recordEvent(tx, {
    orgId: ctx.orgId,
    clientId: ctx.clientId,
    applicationId: application.id,
    actor: "staff",
    actorId: ctx.userId,
    type: "application.created",
    payload: { jobId, source, channel: applicant.channel },
  });
  return "created";
}

async function jobOfClient(tx: Tx, ctx: MemberCtx, jobId: string): Promise<boolean> {
  const [job] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
  return Boolean(job);
}

const applicantSchema = z.object({
  jobId: z.uuid(),
  name: z.string().trim().min(1).max(50),
  email: z.union([z.literal(""), z.email().max(254)]),
  phone: z.union([z.literal(""), z.string().trim().max(30).refine(isPlausiblePhone)]),
  channel: z.string().max(30),
});

export type AddResult = { ok: true } | { ok: false; error: "invalid" | "duplicate" };

export async function addCandidateAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof applicantSchema>,
): Promise<AddResult> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const parsed = applicantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { jobId, name, email, phone, channel } = parsed.data;
  const result = await withRls(ctx, async (tx) => {
    if (!(await jobOfClient(tx, ctx, jobId))) return "invalid" as const;
    return addApplicant(tx, ctx, jobId, "manual", {
      name,
      email: email || null,
      phone: phone || null,
      channel: channel ? normalizeChannel(channel) : null,
    });
  });
  if (result !== "created") return { ok: false, error: result };
  revalidatePath(path(ctx), "layout");
  return { ok: true };
}

const importSchema = z.object({
  jobId: z.uuid(),
  fileName: z.string().trim().min(1).max(200),
  channel: z.string().max(30),
  rows: z
    .array(
      z.object({
        row: z.number().int().min(2),
        name: z.string(),
        email: z.string().nullable(),
        phone: z.string().nullable(),
        channel: z.string().nullable(),
        memo: z.string().nullable(),
      }),
    )
    .min(1)
    .max(2000),
});

export type ImportReport = {
  created: number;
  duplicates: number[];
  failed: { row: number; reason: "name" | "email" | "phone" }[];
};

/** Imports applicants parsed from a job-board CSV (docs/02 M3-9); reports every row's fate. */
export async function importCsvAction(
  orgSlug: string,
  clientSlug: string,
  input: z.input<typeof importSchema>,
): Promise<{ ok: true; report: ImportReport } | { ok: false }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { jobId, fileName, rows } = parsed.data;
  const defaultChannel = parsed.data.channel ? normalizeChannel(parsed.data.channel) : null;

  const report = await withRls(ctx, async (tx) => {
    if (!(await jobOfClient(tx, ctx, jobId))) return null;
    const report: ImportReport = { created: 0, duplicates: [], failed: [] };
    for (const row of rows) {
      const name = row.name.trim().slice(0, 50);
      const email = row.email?.trim() || null;
      const phone = row.phone?.trim() || null;
      if (!name) report.failed.push({ row: row.row, reason: "name" });
      else if (email && !z.email().safeParse(email).success)
        report.failed.push({ row: row.row, reason: "email" });
      else if (phone && !isPlausiblePhone(phone))
        report.failed.push({ row: row.row, reason: "phone" });
      else {
        const channel = (row.channel ? normalizeChannel(row.channel) : null) ?? defaultChannel;
        const result = await addApplicant(tx, ctx, jobId, "csv", { name, email, phone, channel });
        if (result === "created") report.created++;
        else report.duplicates.push(row.row);
      }
    }
    await tx.insert(csvImports).values({
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      jobId,
      fileName,
      channel: defaultChannel,
      rowsTotal: rows.length,
      rowsCreated: report.created,
      rowsDuplicate: report.duplicates.length,
      rowsFailed: report.failed.length,
      errors: report.failed,
      createdBy: ctx.userId,
    });
    return report;
  });
  if (!report) return { ok: false };
  revalidatePath(path(ctx), "layout");
  return { ok: true, report };
}

const CHANGE_STATE: Record<
  Exclude<StageChange, "next_round">,
  {
    stage?: Stage;
    outcome: Outcome;
    waitingOn: "candidate" | "staff" | null;
    nextAction: string | null;
  }
> = {
  offer: {
    stage: "offer",
    outcome: "active",
    waitingOn: "candidate",
    nextAction: "await_offer_reply",
  },
  hired: { stage: "hired", outcome: "hired", waitingOn: null, nextAction: null },
  withdrawn: { outcome: "withdrawn", waitingOn: null, nextAction: null },
  rejected: { outcome: "rejected", waitingOn: null, nextAction: null },
  reopen: { outcome: "active", waitingOn: "staff", nextAction: "review_screening" },
};

/** Manual stage moves with a reason (docs/02 M5-3). */
export async function changeStageAction(
  orgSlug: string,
  clientSlug: string,
  applicationId: string,
  change: StageChange,
  reason?: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  z.uuid().parse(applicationId);
  const note = reason?.trim().slice(0, 200) || null;

  const result = await withRls(ctx, async (tx) => {
    const [app] = await tx
      .select({
        stage: applications.stage,
        outcome: applications.outcome,
        round: applications.currentRound,
      })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.orgId, ctx.orgId),
          eq(applications.clientId, ctx.clientId),
        ),
      );
    if (!app || !allowedChanges(app.stage, app.outcome).includes(change)) return null;

    const set =
      change === "next_round"
        ? {
            stage: "booking" as const,
            currentRound: app.round + 1,
            waitingOn: "staff" as const,
            nextAction: "invite_interview",
          }
        : {
            ...CHANGE_STATE[change],
            closeReason:
              change === "withdrawn" || change === "rejected"
                ? (note ?? change)
                : change === "hired"
                  ? "hired"
                  : null,
          };
    await tx.update(applications).set(set).where(eq(applications.id, applicationId));
    // The reason may describe the person, so it stays on the application, not in the event.
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: "application.stage_changed",
      payload: { change, from: app.stage, fromOutcome: app.outcome },
    });
    // The next round gets its own invitation; leaving the process closes what was open.
    const invitationId =
      change === "next_round"
        ? await issueInvitation(tx, {
            orgId: ctx.orgId,
            clientId: ctx.clientId,
            applicationId,
            round: app.round + 1,
            actor: "staff",
            actorId: ctx.userId,
          })
        : null;
    const canceledInterviews =
      change === "withdrawn" || change === "rejected" || change === "hired"
        ? await closeOpenScheduling(tx, applicationId)
        : [];
    return { invitationId, canceledInterviews };
  });
  if (!result) return { ok: false };
  await afterSchedulingChange({
    orgId: ctx.orgId,
    invitationId: result.invitationId,
    canceledInterviews: result.canceledInterviews,
    rejectedApplications: change === "rejected" ? [applicationId] : [],
  });
  revalidatePath(path(ctx), "layout");
  return { ok: true };
}

/**
 * Deletes a candidate with every application, answer, document and AI record in the company
 * (docs/02 M5-5). Owners and admins only; audited.
 */
export async function deleteCandidateAction(
  orgSlug: string,
  clientSlug: string,
  candidateId: string,
): Promise<{ ok: boolean }> {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isAdmin(ctx)) return { ok: false };
  z.uuid().parse(candidateId);

  const paths = await withRls(ctx, async (tx) => {
    const apps = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.candidateId, candidateId), eq(applications.orgId, ctx.orgId)));
    const docs = apps.length
      ? await tx
          .select({ path: documents.storagePath })
          .from(documents)
          .where(
            inArray(
              documents.applicationId,
              apps.map((a) => a.id),
            ),
          )
      : [];
    const deleted = await tx
      .delete(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.orgId, ctx.orgId)))
      .returning({ id: candidates.id });
    if (deleted.length === 0) return null;
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "candidate.deleted",
      targetType: "candidate",
      targetId: candidateId,
      meta: { applications: apps.length, documents: docs.length },
    });
    return docs.map((d) => d.path);
  });
  if (!paths) return { ok: false };
  await removeObjects("documents", paths);
  revalidatePath(path(ctx), "layout");
  return { ok: true };
}
