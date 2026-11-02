import "server-only";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { getPublicEnv } from "@/lib/env";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { applications, entryUrls, jobs, organizations } from "@/server/db/schema";
import { DEFAULT_ENTRY_TEMPLATE } from "./template";

export type EntryUrlRow = {
  id: string;
  channel: string;
  code: string;
  url: string;
  enabled: boolean;
  /** Applications that came in through this URL. */
  entered: number;
};

export type EntryUrlJob = {
  id: string;
  title: string;
  status: (typeof jobs.$inferSelect)["status"];
  urls: EntryUrlRow[];
};

export const entryUrlFor = (code: string) => `${getPublicEnv().appUrl}/a/${code}`;

/** The client's non-archived jobs, each with its entry URLs and entered counts. */
export async function listEntryUrlsByJob(ctx: MemberCtx): Promise<EntryUrlJob[]> {
  return withRls(ctx, async (tx) => {
    const [jobRows, urlRows] = await Promise.all([
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
      tx
        .select({
          id: entryUrls.id,
          jobId: entryUrls.jobId,
          channel: entryUrls.channel,
          code: entryUrls.code,
          enabled: entryUrls.enabled,
          entered: count(applications.id),
        })
        .from(entryUrls)
        .leftJoin(applications, eq(applications.entryUrlId, entryUrls.id))
        .where(and(eq(entryUrls.orgId, ctx.orgId), eq(entryUrls.clientId, ctx.clientId)))
        .groupBy(entryUrls.id)
        .orderBy(asc(entryUrls.createdAt)),
    ]);
    return jobRows.map((job) => ({
      ...job,
      urls: urlRows
        .filter((u) => u.jobId === job.id)
        .map((u) => ({
          id: u.id,
          channel: u.channel,
          code: u.code,
          url: entryUrlFor(u.code),
          enabled: u.enabled,
          entered: u.entered,
        })),
    }));
  });
}

/** The company's auto-reply template, or the default when none is saved. */
export async function getEntryTemplate(ctx: MemberCtx): Promise<string> {
  const [org] = await withRls(ctx, (tx) =>
    tx
      .select({ template: organizations.entryMsgTemplate })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId)),
  );
  return org?.template || DEFAULT_ENTRY_TEMPLATE;
}
