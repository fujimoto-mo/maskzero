"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { entryFileSchema } from "@/features/intake/entry-schema";
import { recordAudit } from "@/server/audit";
import { type MemberCtx, requireEditor, requireMember } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { applications, documents, screeningDecisions, screeningRuns } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { applicationRescreen, applicationSubmitted } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { createSignedDownload, createSignedUpload } from "@/server/storage";
import type { Verdict } from "./domain";
import { getScreeningDetail, type ScreeningDetail } from "./queries";
import { stateForVerdict } from "./state";

const path = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

/** Loads the drawer's contents. */
export async function screeningDetailAction(
  orgSlug: string,
  clientSlug: string,
  applicationId: string,
): Promise<ScreeningDetail> {
  const ctx = await requireMember(orgSlug, clientSlug);
  return getScreeningDetail(ctx, z.uuid().parse(applicationId));
}

export type Decision = "pass" | "fail" | "check" | "revert";

const MANUAL: Record<Exclude<Decision, "revert">, Verdict> = {
  pass: "manual_pass",
  fail: "manual_fail",
  check: "manual_check",
};

/**
 * A person's screening decision (docs/02 M4-7): pass, fail or needs review, or back to the AI's
 * verdict. Possible until the candidate moves past the interview invitation.
 */
export async function decideAction(
  orgSlug: string,
  clientSlug: string,
  applicationId: string,
  decision: Decision,
  note?: string,
): Promise<{ ok: true } | { ok: false; error: "notFound" | "locked" | "noRun" }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  z.uuid().parse(applicationId);
  const cleanNote = note?.trim().slice(0, 500) || null;

  const result = await withRls(ctx, async (tx) => {
    const [app] = await tx
      .select({ stage: applications.stage, outcome: applications.outcome })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.orgId, ctx.orgId),
          eq(applications.clientId, ctx.clientId),
        ),
      );
    if (!app) return "notFound" as const;
    const open = app.outcome === "active" || app.outcome === "rejected";
    if (!open || !["applied", "screening", "booking"].includes(app.stage)) return "locked" as const;

    let verdict: Verdict;
    if (decision === "revert") {
      const [run] = await tx
        .select({ verdict: screeningRuns.verdictAi })
        .from(screeningRuns)
        .where(eq(screeningRuns.applicationId, applicationId))
        .orderBy(desc(screeningRuns.createdAt))
        .limit(1);
      if (!run) return "noRun" as const;
      verdict = run.verdict;
    } else {
      verdict = MANUAL[decision];
    }

    await tx
      .update(applications)
      .set({ verdict, ...stateForVerdict(verdict) })
      .where(eq(applications.id, applicationId));
    await tx.insert(screeningDecisions).values({
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId,
      verdict,
      source: decision === "revert" ? "revert" : "staff",
      decidedBy: ctx.userId,
      note: cleanNote,
    });
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: "screening.decided",
      payload: { verdict, decision },
    });
    return "ok" as const;
  });
  if (result !== "ok") return { ok: false, error: result };
  revalidatePath(path(ctx), "layout");
  return { ok: true };
}

/** Confirms AI rejections that wait for a person (docs/02 M4-6/M4-7); returns how many. */
export async function confirmRejectionsAction(
  orgSlug: string,
  clientSlug: string,
  applicationIds: string[],
): Promise<{ confirmed: number }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const ids = z.array(z.uuid()).max(500).parse(applicationIds);
  if (ids.length === 0) return { confirmed: 0 };

  const confirmed = await withRls(ctx, async (tx) => {
    const rows = await tx
      .update(applications)
      .set({ verdict: "fail", ...stateForVerdict("fail") })
      .where(
        and(
          inArray(applications.id, ids),
          eq(applications.orgId, ctx.orgId),
          eq(applications.clientId, ctx.clientId),
          eq(applications.verdict, "fail_pending"),
          eq(applications.outcome, "active"),
        ),
      )
      .returning({ id: applications.id });
    if (rows.length === 0) return 0;
    await tx.insert(screeningDecisions).values(
      rows.map((r) => ({
        orgId: ctx.orgId,
        clientId: ctx.clientId,
        applicationId: r.id,
        verdict: "fail" as const,
        source: "confirm" as const,
        decidedBy: ctx.userId,
      })),
    );
    for (const r of rows) {
      await recordEvent(tx, {
        orgId: ctx.orgId,
        clientId: ctx.clientId,
        applicationId: r.id,
        actor: "staff",
        actorId: ctx.userId,
        type: "screening.decided",
        payload: { verdict: "fail", decision: "confirm" },
      });
    }
    return rows.length;
  });
  revalidatePath(path(ctx), "layout");
  return { confirmed };
}

/** Reads an application's documents again and re-screens it (docs/02 M4-12). */
export async function rereadAction(
  orgSlug: string,
  clientSlug: string,
  applicationId: string,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  z.uuid().parse(applicationId);
  const found = await withRls(ctx, async (tx) => {
    const [app] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.orgId, ctx.orgId),
          eq(applications.clientId, ctx.clientId),
        ),
      );
    if (!app) return false;
    // Shown as "reading" until the pipeline is done.
    await tx
      .update(documents)
      .set({ readStatus: "pending", readError: null })
      .where(and(eq(documents.applicationId, applicationId), eq(documents.status, "ready")));
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: "documents.reread_requested",
    });
    return true;
  });
  if (!found) return;
  await sendEventBestEffort(
    applicationRescreen.create({ applicationId, orgId: ctx.orgId, reread: true }),
  );
  revalidatePath(path(ctx), "layout");
}

/** A five-minute link to one document; opening personal documents is audited (docs/05 §8). */
export async function documentLinkAction(
  orgSlug: string,
  clientSlug: string,
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false }> {
  const ctx = await requireMember(orgSlug, clientSlug);
  z.uuid().parse(documentId);
  const doc = await withRls(ctx, async (tx) => {
    const [row] = await tx
      .select({
        path: documents.storagePath,
        fileName: documents.fileName,
        status: documents.status,
      })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.orgId, ctx.orgId),
          eq(documents.clientId, ctx.clientId),
        ),
      );
    if (!row || row.status !== "ready") return null;
    await recordAudit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "document.opened",
      targetType: "document",
      targetId: documentId,
    });
    return row;
  });
  if (!doc) return { ok: false };
  return { ok: true, url: await createSignedDownload(doc.path, doc.fileName) };
}

const EXTENSIONS = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" } as const;

/** Staff upload on a candidate's behalf, step 1: a signed upload URL (docs/02 M3-9). */
export async function createStaffUploadAction(
  orgSlug: string,
  clientSlug: string,
  applicationId: string,
  file: { kind: "resume" | "cv"; name: string; type: string; size: number },
): Promise<{ ok: true; path: string; token: string } | { ok: false }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const parsed = entryFileSchema.safeParse(file);
  if (!parsed.success || !z.uuid().safeParse(applicationId).success) return { ok: false };
  const id = randomUUID();
  const storagePath = `org/${ctx.orgId}/app/${applicationId}/${id}.${EXTENSIONS[parsed.data.type]}`;
  const created = await withRls(ctx, async (tx) => {
    const [app] = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.orgId, ctx.orgId),
          eq(applications.clientId, ctx.clientId),
        ),
      );
    if (!app) return false;
    await tx.insert(documents).values({
      id,
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId,
      kind: parsed.data.kind,
      storagePath,
      fileName: parsed.data.name,
      mime: parsed.data.type,
      bytes: parsed.data.size,
      uploadedBy: "staff",
      uploaderId: ctx.userId,
    });
    return true;
  });
  if (!created) return { ok: false };
  return { ok: true, ...(await createSignedUpload("documents", storagePath)) };
}

/** Step 2: the upload landed; verify, read and screen it like a candidate's upload. */
export async function finishStaffUploadAction(
  orgSlug: string,
  clientSlug: string,
  applicationId: string,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  z.uuid().parse(applicationId);
  await withRls(ctx, (tx) =>
    recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      applicationId,
      actor: "staff",
      actorId: ctx.userId,
      type: "documents.added",
      payload: { by: "staff" },
    }),
  );
  await sendEventBestEffort(applicationSubmitted.create({ applicationId, orgId: ctx.orgId }));
  revalidatePath(path(ctx), "layout");
}
