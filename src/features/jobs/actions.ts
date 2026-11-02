"use server";

import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftJobText, type JobFill } from "@/server/ai/job-fill";
import { aiMode } from "@/server/ai/client";
import { type MemberCtx, requireEditor } from "@/server/auth/session";
import { type Tx } from "@/server/db/client";
import { withRls } from "@/server/db/rls";
import {
  applications,
  jobImages,
  jobs,
  screeningCriteria,
  screeningSettings,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { imageSize, sniffFileType } from "@/server/files";
import { createSignedUpload, downloadObject, removeObjects } from "@/server/storage";
import { checkPosting, isReadyToPost, type PostingIssue } from "./checks";
import { insertJob } from "./mutations";
import { type JobForm, jobFormSchema, type PostingFields, postingFieldsSchema } from "./schema";

// Every action re-checks membership and editor rights, validates its input, and writes under RLS
// together with an event row in one transaction.

const base = (ctx: MemberCtx) => `/app/${ctx.orgSlug}/${ctx.clientSlug}/jobs`;

export async function createJobAction(orgSlug: string, clientSlug: string): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const id = await withRls(ctx, (tx) => insertJob(tx, ctx, {}));
  redirect(`${base(ctx)}/${id}`);
}

export type SaveResult = { ok: true; issues: PostingIssue[] } | { ok: false; error: string };

async function imagesOf(tx: Tx, jobId: string) {
  return tx
    .select({ slot: jobImages.slot, width: jobImages.width, height: jobImages.height })
    .from(jobImages)
    .where(eq(jobImages.jobId, jobId));
}

export async function saveJobAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
  form: JobForm,
): Promise<SaveResult> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const parsed = jobFormSchema.safeParse(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid" };
  const { fields, postingFrom, postingTo, requiresCv } = parsed.data;

  const issues = await withRls(ctx, async (tx) => {
    const updated = await tx
      .update(jobs)
      .set({ title: fields.title ?? "", postingFields: fields, postingFrom, postingTo, requiresCv })
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)))
      .returning({ status: jobs.status });
    if (updated.length === 0) return null;
    const issues = checkPosting(fields, {
      postingFrom,
      postingTo,
      images: await imagesOf(tx, jobId),
    });
    // A published job that no longer passes the checks goes back to draft.
    if (updated[0]!.status === "published" && !isReadyToPost(issues)) {
      await tx.update(jobs).set({ status: "draft" }).where(eq(jobs.id, jobId));
    }
    return issues;
  });
  if (!issues) return { ok: false, error: "notFound" };
  revalidatePath(base(ctx), "layout");
  return { ok: true, issues };
}

export async function setJobStatusAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
  status: "draft" | "published" | "stopped",
): Promise<{ ok: boolean; error?: "notReady" | "notFound" }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const result = await withRls(ctx, async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
    if (!job) return "notFound" as const;
    if (status === "published") {
      const fields = postingFieldsSchema.catch({}).parse(job.postingFields);
      const issues = checkPosting(fields, {
        postingFrom: job.postingFrom,
        postingTo: job.postingTo,
        images: await imagesOf(tx, jobId),
      });
      if (!isReadyToPost(issues)) return "notReady" as const;
    }
    await tx.update(jobs).set({ status }).where(eq(jobs.id, jobId));
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      actor: "staff",
      actorId: ctx.userId,
      type: "job.status_changed",
      payload: { jobId, status },
    });
    return "ok" as const;
  });
  if (result !== "ok") return { ok: false, error: result };
  revalidatePath(base(ctx), "layout");
  return { ok: true };
}

/** Deletes a job without applicants; a job with applicants is archived instead (docs/02 M2-7). */
export async function deleteJobAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const removed = await withRls(ctx, async (tx) => {
    const [apps] = await tx
      .select({ n: count() })
      .from(applications)
      .where(eq(applications.jobId, jobId));
    const scope = and(
      eq(jobs.id, jobId),
      eq(jobs.orgId, ctx.orgId),
      eq(jobs.clientId, ctx.clientId),
    );
    if ((apps?.n ?? 0) > 0) {
      await tx.update(jobs).set({ status: "archived" }).where(scope);
      await recordEvent(tx, {
        orgId: ctx.orgId,
        clientId: ctx.clientId,
        actor: "staff",
        actorId: ctx.userId,
        type: "job.archived",
        payload: { jobId },
      });
      return [];
    }
    const paths = await tx
      .select({ path: jobImages.storagePath })
      .from(jobImages)
      .where(eq(jobImages.jobId, jobId));
    await tx.delete(jobs).where(scope);
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      actor: "staff",
      actorId: ctx.userId,
      type: "job.deleted",
      payload: { jobId },
    });
    return paths.map((p) => p.path);
  });
  await removeObjects("job-images", removed);
  revalidatePath(base(ctx), "layout");
  redirect(base(ctx));
}

/** Copies the posting and screening setup (not images, entry URLs or applicants). */
export async function duplicateJobAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const id = await withRls(ctx, async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
    if (!job) return null;
    const fields = postingFieldsSchema.catch({}).parse(job.postingFields);
    const title = fields.title ? `${fields.title}（コピー）`.slice(0, 100) : "";
    const copyId = await insertJob(tx, ctx, { ...fields, title }, { requiresCv: job.requiresCv });
    const [settings] = await tx
      .select()
      .from(screeningSettings)
      .where(eq(screeningSettings.jobId, jobId));
    if (settings) {
      await tx
        .update(screeningSettings)
        .set({
          passLine: settings.passLine,
          failLine: settings.failLine,
          autoJudge: settings.autoJudge,
          confirmRejections: settings.confirmRejections,
          weightMode: settings.weightMode,
        })
        .where(eq(screeningSettings.jobId, copyId));
    }
    const criteria = await tx
      .select({
        orgId: screeningCriteria.orgId,
        clientId: screeningCriteria.clientId,
        type: screeningCriteria.type,
        label: screeningCriteria.label,
        kind: screeningCriteria.kind,
        source: screeningCriteria.source,
        config: screeningCriteria.config,
        required: screeningCriteria.required,
        weight: screeningCriteria.weight,
        legalException: screeningCriteria.legalException,
        position: screeningCriteria.position,
      })
      .from(screeningCriteria)
      .where(eq(screeningCriteria.jobId, jobId));
    if (criteria.length > 0) {
      await tx.insert(screeningCriteria).values(criteria.map((c) => ({ ...c, jobId: copyId })));
    }
    return copyId;
  });
  if (!id) redirect(base(ctx));
  redirect(`${base(ctx)}/${id}`);
}

export async function fillJobWithAiAction(
  orgSlug: string,
  clientSlug: string,
  fields: PostingFields,
): Promise<{ ok: true; draft: Partial<JobFill> } | { ok: false; error: "aiOff" | "failed" }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  if (aiMode() === "off") return { ok: false, error: "aiOff" };
  try {
    const draft = await draftJobText(ctx.orgId, postingFieldsSchema.catch({}).parse(fields));
    // Only fill what is empty; never overwrite what the user wrote.
    const empty = (key: keyof JobFill) => !fields[key]?.trim();
    return {
      ok: true,
      draft: Object.fromEntries(
        (Object.keys(draft) as (keyof JobFill)[]).filter(empty).map((k) => [k, draft[k]]),
      ),
    };
  } catch (error) {
    console.error("[ai] job fill failed", error);
    return { ok: false, error: "failed" };
  }
}

// ----------------------------------------------------------------------------------------------
// Images: the browser uploads straight to storage, then the server verifies and registers the file.
// ----------------------------------------------------------------------------------------------

const SLOT = (slot: number) => Number.isInteger(slot) && slot >= 1 && slot <= 6;

async function assertJob(tx: Tx, ctx: MemberCtx, jobId: string) {
  const [job] = await tx
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
  return Boolean(job);
}

export async function createJobImageUploadAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
  slot: number,
  contentType: string,
): Promise<{ ok: true; path: string; token: string } | { ok: false }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  if (!SLOT(slot) || !["image/jpeg", "image/png"].includes(contentType)) return { ok: false };
  if (!(await withRls(ctx, (tx) => assertJob(tx, ctx, jobId)))) return { ok: false };
  const extension = contentType === "image/png" ? "png" : "jpg";
  const path = `org/${ctx.orgId}/job/${jobId}/${slot}-${randomUUID()}.${extension}`;
  return { ok: true, ...(await createSignedUpload("job-images", path)) };
}

export async function registerJobImageAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
  slot: number,
  path: string,
): Promise<{ ok: true } | { ok: false; error: "invalid" | "notImage" }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  if (!SLOT(slot) || !path.startsWith(`org/${ctx.orgId}/job/${jobId}/`))
    return { ok: false, error: "invalid" };

  const data = await downloadObject("job-images", path);
  const size = imageSize(data);
  if (!size || !sniffFileType(data)) {
    await removeObjects("job-images", [path]);
    return { ok: false, error: "notImage" };
  }
  const replaced = await withRls(ctx, async (tx) => {
    if (!(await assertJob(tx, ctx, jobId))) return null;
    const [previous] = await tx
      .select({ path: jobImages.storagePath, caption: jobImages.caption })
      .from(jobImages)
      .where(and(eq(jobImages.jobId, jobId), eq(jobImages.slot, slot)));
    await tx.delete(jobImages).where(and(eq(jobImages.jobId, jobId), eq(jobImages.slot, slot)));
    await tx.insert(jobImages).values({
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      jobId,
      slot,
      storagePath: path,
      width: size.width,
      height: size.height,
      bytes: data.length,
      caption: previous?.caption ?? null,
    });
    return previous?.path ?? "";
  });
  if (replaced === null) {
    await removeObjects("job-images", [path]);
    return { ok: false, error: "invalid" };
  }
  if (replaced) await removeObjects("job-images", [replaced]);
  revalidatePath(base(ctx), "layout");
  return { ok: true };
}

export async function removeJobImageAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
  slot: number,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  const removed = await withRls(ctx, (tx) =>
    tx
      .delete(jobImages)
      .where(
        and(eq(jobImages.jobId, jobId), eq(jobImages.slot, slot), eq(jobImages.orgId, ctx.orgId)),
      )
      .returning({ path: jobImages.storagePath }),
  );
  await removeObjects(
    "job-images",
    removed.map((r) => r.path),
  );
  revalidatePath(base(ctx), "layout");
}

export async function updateJobImageCaptionAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
  slot: number,
  caption: string,
): Promise<void> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  await withRls(ctx, (tx) =>
    tx
      .update(jobImages)
      .set({ caption: caption.trim().slice(0, 70) || null })
      .where(
        and(eq(jobImages.jobId, jobId), eq(jobImages.slot, slot), eq(jobImages.orgId, ctx.orgId)),
      ),
  );
  revalidatePath(base(ctx), "layout");
}
