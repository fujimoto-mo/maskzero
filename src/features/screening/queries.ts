import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import {
  applicationAnswers,
  applications,
  candidates,
  documents,
  jobs,
  profiles,
  screeningCriteria,
  screeningDecisions,
  screeningRuns,
  screeningSettings,
} from "@/server/db/schema";
import { toCriterion } from "./criteria";
import { FILTER_VERDICTS, SCREENING_FILTERS, type ScreeningFilter } from "./screening-filters";
import type { Criterion, CriterionOutcome, Settings, Verdict } from "./domain";

export type { ScreeningFilter };

export type ScreeningRow = {
  applicationId: string;
  candidateName: string;
  channel: string | null;
  appliedAt: Date;
  verdict: Verdict;
  score: number | null;
  stage: (typeof applications.$inferSelect)["stage"];
  outcome: (typeof applications.$inferSelect)["outcome"];
  basicMet: number;
  basicTotal: number;
  resume: DocumentState;
  cv: DocumentState;
};

export type DocumentState = "none" | "reading" | "read" | "failed";

function documentState(rows: { status: string; readStatus: string }[]): DocumentState {
  const live = rows.filter((r) => r.status !== "rejected");
  if (live.length === 0) return "none";
  if (live.some((r) => r.status === "uploading" || r.readStatus === "pending")) return "reading";
  if (live.some((r) => r.readStatus === "failed")) return "failed";
  return "read";
}

/** Jobs with applications or screening set up, for the job picker. */
export async function listScreeningJobs(ctx: MemberCtx) {
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

/** One job's applications in screening order (newest first) with counts per filter tab. */
export async function listScreening(
  ctx: MemberCtx,
  jobId: string,
  filter: ScreeningFilter,
): Promise<{ rows: ScreeningRow[]; counts: Record<ScreeningFilter, number> }> {
  return withRls(ctx, async (tx) => {
    const scope = and(
      eq(applications.jobId, jobId),
      eq(applications.orgId, ctx.orgId),
      eq(applications.clientId, ctx.clientId),
    );
    const [apps, verdictCounts] = await Promise.all([
      tx
        .select({
          applicationId: applications.id,
          candidateName: candidates.name,
          channel: applications.channel,
          appliedAt: applications.appliedAt,
          verdict: applications.verdict,
          score: applications.score,
          stage: applications.stage,
          outcome: applications.outcome,
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .where(
          filter === "all"
            ? scope
            : and(scope, inArray(applications.verdict, FILTER_VERDICTS[filter])),
        )
        .orderBy(desc(applications.appliedAt))
        .limit(500),
      tx
        .select({ verdict: applications.verdict, n: sql<number>`count(*)::int` })
        .from(applications)
        .where(scope)
        .groupBy(applications.verdict),
    ]);

    const ids = apps.map((a) => a.applicationId);
    const [docRows, runRows] = ids.length
      ? await Promise.all([
          tx
            .select({
              applicationId: documents.applicationId,
              kind: documents.kind,
              status: documents.status,
              readStatus: documents.readStatus,
            })
            .from(documents)
            .where(inArray(documents.applicationId, ids)),
          // Latest run per application.
          tx
            .selectDistinctOn([screeningRuns.applicationId], {
              applicationId: screeningRuns.applicationId,
              results: screeningRuns.results,
            })
            .from(screeningRuns)
            .where(inArray(screeningRuns.applicationId, ids))
            .orderBy(screeningRuns.applicationId, desc(screeningRuns.createdAt)),
        ])
      : [[], []];

    const counts = Object.fromEntries(SCREENING_FILTERS.map((f) => [f, 0])) as Record<
      ScreeningFilter,
      number
    >;
    for (const { verdict, n } of verdictCounts) {
      counts.all += n;
      for (const [f, verdicts] of Object.entries(FILTER_VERDICTS)) {
        if (verdicts.includes(verdict)) counts[f as ScreeningFilter] += n;
      }
    }

    const rows = apps.map((app) => {
      const docs = docRows.filter((d) => d.applicationId === app.applicationId);
      const outcomes = (runRows.find((r) => r.applicationId === app.applicationId)?.results ??
        []) as CriterionOutcome[];
      const basic = outcomes.filter((o) => o.type === "basic");
      return {
        ...app,
        basicMet: basic.filter((o) => o.met === true).length,
        basicTotal: basic.length,
        resume: documentState(docs.filter((d) => d.kind === "resume")),
        cv: documentState(docs.filter((d) => d.kind === "cv")),
      };
    });
    return { rows, counts };
  });
}

export type ScreeningDetail = {
  applicationId: string;
  jobId: string;
  candidateName: string;
  prefecture: string | null;
  city: string | null;
  channel: string | null;
  appliedAt: string;
  verdict: Verdict;
  score: number | null;
  stage: (typeof applications.$inferSelect)["stage"];
  outcome: (typeof applications.$inferSelect)["outcome"];
  passLine: number;
  failLine: number;
  run: {
    verdict: Verdict;
    score: number | null;
    outcomes: CriterionOutcome[];
    reasons: string[];
    model: string | null;
    createdAt: string;
  } | null;
  answers: { key: string; label: string; value: string }[];
  documents: {
    id: string;
    kind: "resume" | "cv" | "other";
    fileName: string;
    status: string;
    readStatus: string;
    readError: string | null;
    legibility: string | null;
    pages: number | null;
    uploadedBy: "candidate" | "staff";
    transcript: string | null;
    createdAt: string;
  }[];
  decisions: {
    verdict: Verdict;
    source: string;
    by: string | null;
    note: string | null;
    at: string;
  }[];
};

const STANDARD_LABELS: Record<string, string> = {
  pay_band: "希望年収",
  start_timing: "入社できる時期",
};

/** Everything the screening drawer shows for one application (docs/01 §5.5). */
export async function getScreeningDetail(
  ctx: MemberCtx,
  applicationId: string,
): Promise<ScreeningDetail> {
  const detail = await withRls(ctx, async (tx) => {
    const [app] = await tx
      .select({
        applicationId: applications.id,
        jobId: applications.jobId,
        candidateName: candidates.name,
        prefecture: candidates.prefecture,
        city: candidates.city,
        channel: applications.channel,
        appliedAt: applications.appliedAt,
        verdict: applications.verdict,
        score: applications.score,
        stage: applications.stage,
        outcome: applications.outcome,
        passLine: screeningSettings.passLine,
        failLine: screeningSettings.failLine,
      })
      .from(applications)
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .leftJoin(screeningSettings, eq(screeningSettings.jobId, applications.jobId))
      .where(
        and(
          eq(applications.id, applicationId),
          eq(applications.orgId, ctx.orgId),
          eq(applications.clientId, ctx.clientId),
        ),
      );
    if (!app) return null;

    const [[run], answers, criteria, docs, decisions] = await Promise.all([
      tx
        .select()
        .from(screeningRuns)
        .where(eq(screeningRuns.applicationId, applicationId))
        .orderBy(desc(screeningRuns.createdAt))
        .limit(1),
      tx
        .select({ key: applicationAnswers.key, value: applicationAnswers.value })
        .from(applicationAnswers)
        .where(eq(applicationAnswers.applicationId, applicationId)),
      tx
        .select({ id: screeningCriteria.id, label: screeningCriteria.label })
        .from(screeningCriteria)
        .where(eq(screeningCriteria.jobId, app.jobId)),
      tx
        .select()
        .from(documents)
        .where(eq(documents.applicationId, applicationId))
        .orderBy(asc(documents.createdAt)),
      tx
        .select({
          verdict: screeningDecisions.verdict,
          source: screeningDecisions.source,
          by: profiles.name,
          byEmail: profiles.email,
          note: screeningDecisions.note,
          at: screeningDecisions.createdAt,
        })
        .from(screeningDecisions)
        .leftJoin(profiles, eq(profiles.id, screeningDecisions.decidedBy))
        .where(eq(screeningDecisions.applicationId, applicationId))
        .orderBy(desc(screeningDecisions.createdAt)),
    ]);
    return { app, run, answers, criteria, docs, decisions };
  });
  if (!detail) notFound();
  const { app, run, answers, criteria, docs, decisions } = detail;

  const labelOf = (key: string) =>
    STANDARD_LABELS[key] ?? criteria.find((c) => `criterion:${c.id}` === key)?.label ?? key;
  const show = (value: unknown) => (Array.isArray(value) ? value.join("・") : String(value));

  return {
    ...app,
    appliedAt: app.appliedAt.toISOString(),
    passLine: app.passLine ?? 70,
    failLine: app.failLine ?? 40,
    run: run
      ? {
          verdict: run.verdictAi,
          score: run.score,
          outcomes: run.results as CriterionOutcome[],
          reasons: run.reasons as string[],
          model: run.model,
          createdAt: run.createdAt.toISOString(),
        }
      : null,
    answers: answers.map((a) => ({ key: a.key, label: labelOf(a.key), value: show(a.value) })),
    documents: docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      fileName: d.fileName,
      status: d.status,
      readStatus: d.readStatus,
      readError: d.readError,
      legibility: d.legibility,
      pages: d.pages,
      uploadedBy: d.uploadedBy,
      transcript: d.transcript,
      createdAt: d.createdAt.toISOString(),
    })),
    decisions: decisions.map((d) => ({
      verdict: d.verdict,
      source: d.source,
      by: d.by ?? d.byEmail ?? null,
      note: d.note,
      at: d.at.toISOString(),
    })),
  };
}

export type CriteriaSetup = {
  jobId: string;
  jobTitle: string;
  settings: Settings;
  criteria: (Criterion & { legalException: string | null })[];
  /** Applications that a change would re-screen. */
  openApplications: number;
  /** Bumped on every save; the editor remounts with fresh ids when it changes. */
  version: number;
};

export async function getCriteriaSetup(ctx: MemberCtx, jobId: string): Promise<CriteriaSetup> {
  const setup = await withRls(ctx, async (tx) => {
    const [job] = await tx
      .select({ id: jobs.id, title: jobs.title })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.orgId, ctx.orgId), eq(jobs.clientId, ctx.clientId)));
    if (!job) return null;
    const [[settings], rows, [open]] = await Promise.all([
      tx.select().from(screeningSettings).where(eq(screeningSettings.jobId, jobId)),
      tx
        .select()
        .from(screeningCriteria)
        .where(eq(screeningCriteria.jobId, jobId))
        .orderBy(asc(screeningCriteria.position)),
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(applications)
        .where(
          and(
            eq(applications.jobId, jobId),
            eq(applications.outcome, "active"),
            inArray(applications.stage, ["applied", "screening"]),
          ),
        ),
    ]);
    return { job, settings, rows, open: open?.n ?? 0 };
  });
  if (!setup) notFound();
  const { job, settings, rows, open } = setup;
  return {
    jobId: job.id,
    jobTitle: job.title,
    settings: {
      passLine: settings?.passLine ?? 70,
      failLine: settings?.failLine ?? 40,
      autoJudge: settings?.autoJudge ?? true,
      confirmRejections: settings?.confirmRejections ?? true,
      weightMode: settings?.weightMode ?? "equal",
    },
    criteria: rows.flatMap((row) => {
      const c = toCriterion(row);
      return c ? [{ ...c, legalException: row.legalException }] : [];
    }),
    openApplications: open,
    version: settings?.criteriaVersion ?? 0,
  };
}
