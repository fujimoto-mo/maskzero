import "server-only";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { applications, entryUrls, jobImages, jobs } from "@/server/db/schema";
import { publicUrl } from "@/server/storage";
import { checkPosting, type PostingIssue } from "./checks";
import { type PostingFields, postingFieldsSchema } from "./schema";

export type JobImage = {
  slot: number;
  width: number;
  height: number;
  caption: string | null;
  url: string;
};

export type JobListItem = {
  id: string;
  title: string;
  status: (typeof jobs.$inferSelect)["status"];
  fields: PostingFields;
  postingFrom: string | null;
  postingTo: string | null;
  imageCount: number;
  issues: PostingIssue[];
  entryUrlCount: number;
  applicationCount: number;
  updatedAt: Date;
};

const parseFields = (value: unknown): PostingFields => postingFieldsSchema.catch({}).parse(value);

/** Jobs of the current client, newest first, with readiness and intake counts. Archived jobs are hidden. */
export async function listJobs(ctx: MemberCtx): Promise<JobListItem[]> {
  return withRls(ctx, async (tx) => {
    const rows = await tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.orgId, ctx.orgId),
          eq(jobs.clientId, ctx.clientId),
          ne(jobs.status, "archived"),
        ),
      )
      .orderBy(sql`${jobs.updatedAt} desc`);
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return [];

    const [images, urlCounts, appCounts] = await Promise.all([
      tx
        .select({
          jobId: jobImages.jobId,
          slot: jobImages.slot,
          width: jobImages.width,
          height: jobImages.height,
        })
        .from(jobImages)
        .where(inArray(jobImages.jobId, ids)),
      tx
        .select({ jobId: entryUrls.jobId, n: count() })
        .from(entryUrls)
        .where(inArray(entryUrls.jobId, ids))
        .groupBy(entryUrls.jobId),
      tx
        .select({ jobId: applications.jobId, n: count() })
        .from(applications)
        .where(inArray(applications.jobId, ids))
        .groupBy(applications.jobId),
    ]);

    return rows.map((job) => {
      const fields = parseFields(job.postingFields);
      const jobImagesOf = images.filter((i) => i.jobId === job.id);
      return {
        id: job.id,
        title: job.title,
        status: job.status,
        fields,
        postingFrom: job.postingFrom,
        postingTo: job.postingTo,
        imageCount: jobImagesOf.length,
        issues: checkPosting(fields, {
          postingFrom: job.postingFrom,
          postingTo: job.postingTo,
          images: jobImagesOf,
        }),
        entryUrlCount: urlCounts.find((u) => u.jobId === job.id)?.n ?? 0,
        applicationCount: appCounts.find((a) => a.jobId === job.id)?.n ?? 0,
        updatedAt: job.updatedAt,
      };
    });
  });
}

export type JobDetail = {
  id: string;
  status: (typeof jobs.$inferSelect)["status"];
  fields: PostingFields;
  postingFrom: string | null;
  postingTo: string | null;
  requiresCv: boolean;
  images: JobImage[];
  applicationCount: number;
};

export async function getJob(ctx: MemberCtx, jobId: string): Promise<JobDetail> {
  const detail = await withRls(ctx, async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
    if (!job) return null;
    const [images, [apps]] = await Promise.all([
      tx.select().from(jobImages).where(eq(jobImages.jobId, job.id)).orderBy(asc(jobImages.slot)),
      tx.select({ n: count() }).from(applications).where(eq(applications.jobId, job.id)),
    ]);
    return { job, images, applicationCount: apps?.n ?? 0 };
  });
  if (!detail) notFound();
  const { job, images, applicationCount } = detail;
  return {
    id: job.id,
    status: job.status,
    fields: parseFields(job.postingFields),
    postingFrom: job.postingFrom,
    postingTo: job.postingTo,
    requiresCv: job.requiresCv,
    images: images.map((i) => ({
      slot: i.slot,
      width: i.width,
      height: i.height,
      caption: i.caption,
      url: publicUrl("job-images", i.storagePath),
    })),
    applicationCount,
  };
}

/** Published and draft jobs for pickers (entry URLs, CSV import, screening). */
export async function listJobOptions(ctx: MemberCtx) {
  return withRls(ctx, (tx) =>
    tx
      .select({ id: jobs.id, title: jobs.title, status: jobs.status })
      .from(jobs)
      .where(
        and(
          eq(jobs.orgId, ctx.orgId),
          eq(jobs.clientId, ctx.clientId),
          ne(jobs.status, "archived"),
        ),
      )
      .orderBy(sql`${jobs.updatedAt} desc`),
  );
}
