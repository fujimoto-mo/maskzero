"use server";

import { and, eq, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/server/audit";
import { requireEditor } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { jobs, screeningCriteria, screeningSettings } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { criteriaChanged } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { type CriterionRow, toCriterion } from "./criteria";
import { AGE_EXCEPTIONS, checkCriterionText } from "./domain";

const MAX_CRITERIA = 20;

const common = {
  /** Existing criteria keep their id, so entry answers stay linked to them. */
  id: z.string().max(64).optional(),
  required: z.boolean(),
  weight: z.number().int().min(0).max(100),
  legalException: z.string().max(10).nullable(),
};

const criterionInput = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal("specialist"), label: z.string().trim().min(1).max(100) }),
  z.object({
    ...common,
    type: z.literal("basic"),
    label: z.string().trim().min(1).max(60),
    kind: z.enum(["choices", "dropdown", "range"]),
    source: z.enum(["form", "resume"]),
    config: z.unknown(),
  }),
]);

const setupInput = z.object({
  settings: z
    .object({
      passLine: z.number().int().min(1).max(100),
      failLine: z.number().int().min(0).max(99),
      autoJudge: z.boolean(),
      confirmRejections: z.boolean(),
      weightMode: z.enum(["equal", "custom"]),
    })
    .refine((s) => s.failLine < s.passLine),
  criteria: z.array(criterionInput).max(MAX_CRITERIA),
});

export type CriteriaInput = z.input<typeof setupInput>;

export type CriteriaError = {
  /** Index into criteria; -1 for the settings. */
  index: number;
  code: "invalid" | "blocked" | "ageException" | "lines";
  topic?: string;
};

function optionsOf(config: unknown): string[] {
  const options = (config as { options?: unknown } | null)?.options;
  return Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : [];
}

/**
 * Saves a job's screening settings and conditions (docs/02 M4-2 – M4-6, M4-10), then re-screens its
 * open applications. Banned topics are refused; age conditions need a legal exception reason.
 */
export async function saveCriteriaAction(
  orgSlug: string,
  clientSlug: string,
  jobId: string,
  input: CriteriaInput,
): Promise<{ ok: true } | { ok: false; errors: CriteriaError[] }> {
  const ctx = await requireEditor(orgSlug, clientSlug);
  if (!z.uuid().safeParse(jobId).success)
    return { ok: false, errors: [{ index: -1, code: "invalid" }] };
  const parsed = setupInput.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue): CriteriaError => {
      const [root, index] = issue.path;
      if (root === "criteria" && typeof index === "number") return { index, code: "invalid" };
      return { index: -1, code: root === "settings" ? "lines" : "invalid" };
    });
    return { ok: false, errors };
  }
  const { settings, criteria } = parsed.data;

  const errors: CriteriaError[] = [];
  criteria.forEach((c, index) => {
    const options = c.type === "basic" ? optionsOf(c.config) : [];
    const check = checkCriterionText(c.label, ...options);
    if (check?.level === "blocked") errors.push({ index, code: "blocked", topic: check.topic });
    else if (check?.level === "age" && !(c.legalException && c.legalException in AGE_EXCEPTIONS)) {
      errors.push({ index, code: "ageException" });
    }
    if (c.type === "basic") {
      const row: CriterionRow = {
        ...c,
        id: "check",
        kind: c.kind,
        source: c.source,
        weight: c.weight,
      };
      const valid = toCriterion(row);
      const consistent =
        valid?.type === "basic" &&
        (valid.kind !== "choices" ||
          valid.config.pass.every((p) => valid.config.options.includes(p))) &&
        (valid.kind !== "range" ||
          valid.config.min == null ||
          valid.config.max == null ||
          valid.config.min <= valid.config.max);
      if (!consistent) errors.push({ index, code: "invalid" });
    }
  });
  if (errors.length > 0) return { ok: false, errors };

  const saved = await withRls(ctx, async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
    if (!job) return false;

    const [before] = await tx
      .select({ confirmRejections: screeningSettings.confirmRejections })
      .from(screeningSettings)
      .where(eq(screeningSettings.jobId, jobId));
    await tx
      .insert(screeningSettings)
      .values({ jobId, orgId: ctx.orgId, clientId: ctx.clientId, ...settings })
      .onConflictDoUpdate({
        target: screeningSettings.jobId,
        set: { ...settings, criteriaVersion: sql`${screeningSettings.criteriaVersion} + 1` },
      });

    const existing = new Set(
      (
        await tx
          .select({ id: screeningCriteria.id })
          .from(screeningCriteria)
          .where(eq(screeningCriteria.jobId, jobId))
      ).map((r) => r.id),
    );
    const kept = criteria.flatMap((c) => (c.id && existing.has(c.id) ? [c.id] : []));
    await tx
      .delete(screeningCriteria)
      .where(
        kept.length > 0
          ? and(eq(screeningCriteria.jobId, jobId), notInArray(screeningCriteria.id, kept))
          : eq(screeningCriteria.jobId, jobId),
      );

    for (const [position, c] of criteria.entries()) {
      const values = {
        type: c.type,
        label: c.label,
        kind: c.type === "basic" ? c.kind : null,
        source: c.type === "basic" ? c.source : null,
        config: c.type === "basic" ? (c.config as object) : {},
        required: c.required,
        weight: c.weight,
        legalException: c.legalException,
        position,
      };
      if (c.id && existing.has(c.id)) {
        await tx
          .update(screeningCriteria)
          .set(values)
          .where(and(eq(screeningCriteria.id, c.id), eq(screeningCriteria.jobId, jobId)));
      } else {
        await tx
          .insert(screeningCriteria)
          .values({ ...values, orgId: ctx.orgId, clientId: ctx.clientId, jobId });
      }
    }

    if (before?.confirmRejections !== false && !settings.confirmRejections) {
      await recordAudit(tx, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        action: "screening.confirm_rejections_disabled",
        targetType: "job",
        targetId: jobId,
      });
    }
    await recordEvent(tx, {
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      actor: "staff",
      actorId: ctx.userId,
      type: "screening.criteria_updated",
      payload: { jobId, count: criteria.length },
    });
    return true;
  });
  if (!saved) return { ok: false, errors: [{ index: -1, code: "invalid" }] };

  await sendEventBestEffort(criteriaChanged.create({ jobId, orgId: ctx.orgId }));
  revalidatePath(`/app/${ctx.orgSlug}/${ctx.clientSlug}`, "layout");
  return { ok: true };
}
