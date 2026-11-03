"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { POOL_CHANNEL } from "@/features/intake/channels";
import { requireEditor } from "@/server/auth/session";
import { newEntryCode } from "@/server/crypto/tokens";
import { withRls } from "@/server/db/rls";
import { applications, consents, entryUrls, jobs, poolSuggestions } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { poolSuggested } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";

export type SuggestResult =
  { ok: true } | { ok: false; error: "notOptedIn" | "unavailable" | "already" | "scope" };

/**
 * Suggests a published job to a candidate who opted in (docs/02 M5-6): records it once per job,
 * makes sure the job has a talent-pool entry URL, and emails the candidate in the background.
 */
export async function suggestJobAction(
  orgSlug: string,
  clientSlug: string,
  candidateId: string,
  jobId: string,
): Promise<SuggestResult> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  z.uuid().parse(candidateId);
  z.uuid().parse(jobId);
  if (ctx.orgKind !== "agency") return { ok: false, error: "unavailable" };

  const result = await withRls(
    ctx,
    async (tx): Promise<SuggestResult | { ok: true; suggestionId: string }> => {
      const [consent] = await tx
        .select({ granted: consents.granted })
        .from(consents)
        .where(
          and(
            eq(consents.orgId, ctx.orgId),
            eq(consents.candidateId, candidateId),
            eq(consents.kind, "other_jobs"),
          ),
        )
        .orderBy(desc(consents.createdAt))
        .limit(1);
      if (!consent?.granted) return { ok: false, error: "notOptedIn" };
      const [job] = await tx
        .select({ id: jobs.id, clientId: jobs.clientId, status: jobs.status })
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId)));
      if (!job || job.status !== "published") return { ok: false, error: "unavailable" };
      const [source] = await tx
        .select({ id: applications.id, clientId: applications.clientId })
        .from(applications)
        .where(
          and(
            eq(applications.orgId, ctx.orgId),
            eq(applications.candidateId, candidateId),
            eq(applications.otherJobsOptIn, true),
          ),
        )
        .orderBy(desc(applications.appliedAt))
        .limit(1);
      if (!source) return { ok: false, error: "notOptedIn" };

      try {
        return await tx.transaction(async (sp) => {
          await sp
            .insert(entryUrls)
            .values({
              orgId: ctx.orgId,
              clientId: job.clientId,
              jobId: job.id,
              channel: POOL_CHANNEL,
              code: newEntryCode(),
            })
            .onConflictDoNothing({ target: [entryUrls.jobId, entryUrls.channel] });
          const [suggestion] = await sp
            .insert(poolSuggestions)
            .values({
              orgId: ctx.orgId,
              clientId: job.clientId,
              jobId: job.id,
              candidateId,
              sourceApplicationId: source.id,
              suggestedBy: ctx.userId,
            })
            .onConflictDoNothing({ target: [poolSuggestions.candidateId, poolSuggestions.jobId] })
            .returning({ id: poolSuggestions.id });
          if (!suggestion) return { ok: false as const, error: "already" as const };
          await recordEvent(sp, {
            orgId: ctx.orgId,
            clientId: source.clientId,
            applicationId: source.id,
            actor: "staff",
            actorId: ctx.userId,
            type: "pool.suggested",
            payload: { jobId: job.id, suggestionId: suggestion.id },
          });
          return { ok: true as const, suggestionId: suggestion.id };
        });
      } catch {
        // The suggested job's client is outside the member's scope (RLS refused the rows).
        return { ok: false, error: "scope" };
      }
    },
  );
  if (!result.ok) return result;
  if ("suggestionId" in result) {
    await sendEventBestEffort(
      poolSuggested.create({ suggestionId: result.suggestionId, orgId: ctx.orgId }),
    );
  }
  revalidatePath(`/app/${ctx.orgSlug}/${ctx.clientSlug}/pool`);
  return { ok: true };
}
