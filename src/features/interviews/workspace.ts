import "server-only";
import { and, asc, desc, eq, gte, isNull, lt, ne } from "drizzle-orm";
import type { CriterionOutcome } from "@/features/screening/domain";
import { addDays, jstInstant } from "@/features/scheduling/slots";
import type { MemberCtx } from "@/server/auth/session";
import { decryptOptional } from "@/server/crypto/pii";
import { withRls } from "@/server/db/rls";
import {
  applications,
  candidates,
  documents,
  interviewDecisions,
  interviewEvaluations,
  interviewQuestions,
  interviewReports,
  interviews,
  interviewTranscripts,
  jobs,
  memberships,
  organizations,
  type PrepQuestion,
  profiles,
  type ReportScore,
  screeningRuns,
} from "@/server/db/schema";
import { averageScore, rankAmong, type Segment } from "./rubric";

type Status = (typeof interviews.$inferSelect)["status"];
type Tool = (typeof interviews.$inferSelect)["tool"];

export type DayInterview = {
  id: string;
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  round: number;
  startsAt: string;
  endsAt: string;
  tool: Tool;
  meetingUrl: string | null;
  location: string | null;
  status: Status;
  interviewers: string[];
  mine: boolean;
};

/** Names of the org's members by id (for interviewer lists). */
async function memberNames(tx: Parameters<Parameters<typeof withRls>[1]>[0], orgId: string) {
  const rows = await tx
    .select({ id: profiles.id, name: profiles.name, email: profiles.email, role: memberships.role })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.status, "active")))
    .orderBy(asc(memberships.createdAt));
  return rows.map((r) => ({ id: r.id, name: r.name || r.email, role: r.role }));
}

/** The interviews of one Japan day (docs/02 M11-1); interviewers see only their own (RLS). */
export async function listInterviewsOn(ctx: MemberCtx, date: string): Promise<DayInterview[]> {
  return withRls(ctx, async (tx) => {
    const [rows, members] = await Promise.all([
      tx
        .select({
          id: interviews.id,
          applicationId: interviews.applicationId,
          candidateName: candidates.name,
          jobTitle: jobs.title,
          round: interviews.round,
          startsAt: interviews.startsAt,
          endsAt: interviews.endsAt,
          tool: interviews.tool,
          meetingUrl: interviews.meetingUrl,
          location: interviews.location,
          status: interviews.status,
          interviewerIds: interviews.interviewerIds,
        })
        .from(interviews)
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(
          and(
            eq(interviews.orgId, ctx.orgId),
            eq(interviews.clientId, ctx.clientId),
            ne(interviews.status, "canceled"),
            gte(interviews.startsAt, jstInstant(date, "00:00")),
            lt(interviews.startsAt, jstInstant(addDays(date, 1), "00:00")),
          ),
        )
        .orderBy(asc(interviews.startsAt)),
      memberNames(tx, ctx.orgId),
    ]);
    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    return rows.map((r) => ({
      ...r,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt.toISOString(),
      interviewers: r.interviewerIds.map((id) => nameOf.get(id) ?? "—"),
      mine: r.interviewerIds.includes(ctx.userId),
    }));
  });
}

export type Workspace = {
  interview: DayInterview & {
    purpose: string | null;
    recordingAllowed: boolean;
    interviewerIds: string[];
  };
  stage: (typeof applications.$inferSelect)["stage"];
  outcome: (typeof applications.$inferSelect)["outcome"];
  currentRound: number;
  recordsInterviews: boolean;
  /** Members who can be assigned (editors see them; others get an empty list). */
  members: { id: string; name: string; role: string }[];
  highlights: {
    screening: {
      label: string;
      result: "met" | "partial" | "unmet" | "unknown";
      evidence: string | null;
    }[];
    workHistory: { period: string; company: string; role: string }[];
    licences: string[];
    skills: string[];
    motivation: string | null;
  };
  questions: { mode: "standard" | "deep"; items: PrepQuestion[]; generated: boolean };
  evaluations: {
    authorId: string;
    authorName: string;
    scores: Record<string, number>;
    comments: Record<string, string>;
    notes: string | null;
    recommendation: (typeof interviewEvaluations.$inferSelect)["recommendation"];
    average: number | null;
  }[];
  transcript: { segments: Segment[]; uploadedAt: string } | null;
  report: {
    status: (typeof interviewReports.$inferSelect)["status"];
    scores: ReportScore[];
    total: number | null;
    summary: string | null;
    needs: string[];
    error: string | null;
    /** Among AI reports for the same job and round. */
    rank: { rank: number; of: number } | null;
  } | null;
  decision: {
    id: string;
    decision: (typeof interviewDecisions.$inferSelect)["decision"];
    effectiveAt: string;
    decidedBy: string;
  } | null;
};

function screeningResult(o: CriterionOutcome): "met" | "partial" | "unmet" | "unknown" {
  if (o.type === "basic") return o.met === null ? "unknown" : o.met ? "met" : "unmet";
  if (o.match === "yes") return "met";
  if (o.match === "partial") return "partial";
  if (o.match === "no") return "unmet";
  return "unknown";
}

/** Everything the interview page shows (docs/02 M11-2 – M11-6), or null if not visible. */
export async function getWorkspace(
  ctx: MemberCtx,
  interviewId: string,
  canAssign: boolean,
): Promise<Workspace | null> {
  return withRls(ctx, async (tx) => {
    const [row] = await tx
      .select({
        id: interviews.id,
        applicationId: interviews.applicationId,
        candidateName: candidates.name,
        jobId: jobs.id,
        jobTitle: jobs.title,
        round: interviews.round,
        startsAt: interviews.startsAt,
        endsAt: interviews.endsAt,
        tool: interviews.tool,
        meetingUrl: interviews.meetingUrl,
        location: interviews.location,
        status: interviews.status,
        interviewerIds: interviews.interviewerIds,
        purpose: interviews.purpose,
        recordingAllowed: interviews.recordingAllowed,
        stage: applications.stage,
        outcome: applications.outcome,
        currentRound: applications.currentRound,
      })
      .from(interviews)
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(
        and(
          eq(interviews.id, interviewId),
          eq(interviews.orgId, ctx.orgId),
          eq(interviews.clientId, ctx.clientId),
        ),
      );
    if (!row) return null;

    const [
      members,
      [org],
      [run],
      docs,
      [questions],
      evaluations,
      [transcript],
      [report],
      [decision],
    ] = await Promise.all([
      memberNames(tx, ctx.orgId),
      tx
        .select({ records: organizations.recordsInterviews })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId)),
      tx
        .select({ results: screeningRuns.results })
        .from(screeningRuns)
        .where(eq(screeningRuns.applicationId, row.applicationId))
        .orderBy(desc(screeningRuns.createdAt))
        .limit(1),
      tx
        .select({ profile: documents.profile })
        .from(documents)
        .where(
          and(eq(documents.applicationId, row.applicationId), ne(documents.status, "rejected")),
        ),
      tx.select().from(interviewQuestions).where(eq(interviewQuestions.interviewId, interviewId)),
      tx
        .select()
        .from(interviewEvaluations)
        .where(eq(interviewEvaluations.interviewId, interviewId))
        .orderBy(asc(interviewEvaluations.createdAt)),
      tx
        .select()
        .from(interviewTranscripts)
        .where(eq(interviewTranscripts.interviewId, interviewId)),
      tx.select().from(interviewReports).where(eq(interviewReports.interviewId, interviewId)),
      tx
        .select()
        .from(interviewDecisions)
        .where(
          and(eq(interviewDecisions.interviewId, interviewId), isNull(interviewDecisions.undoneAt)),
        )
        .orderBy(desc(interviewDecisions.createdAt))
        .limit(1),
    ]);

    // Comparison with the AI reports of the same job and round (M11-6).
    let rank: { rank: number; of: number } | null = null;
    if (report?.status === "ready" && report.total !== null) {
      const others = await tx
        .select({ total: interviewReports.total })
        .from(interviewReports)
        .innerJoin(interviews, eq(interviews.id, interviewReports.interviewId))
        .innerJoin(applications, eq(applications.id, interviewReports.applicationId))
        .where(
          and(
            eq(applications.jobId, row.jobId),
            eq(interviews.round, row.round),
            eq(interviewReports.status, "ready"),
            ne(interviewReports.interviewId, interviewId),
          ),
        );
      rank = rankAmong(
        Number(report.total),
        others.flatMap((o) => (o.total === null ? [] : [Number(o.total)])),
      );
    }

    const nameOf = new Map(members.map((m) => [m.id, m.name]));
    const profiles_ = docs.flatMap((d) => (d.profile ? [d.profile as ProfileShape] : []));
    const outcomes = (run?.results ?? []) as CriterionOutcome[];
    return {
      interview: {
        ...row,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        interviewers: row.interviewerIds.map((id) => nameOf.get(id) ?? "—"),
        mine: row.interviewerIds.includes(ctx.userId),
      },
      stage: row.stage,
      outcome: row.outcome,
      currentRound: row.currentRound,
      recordsInterviews: org?.records ?? false,
      members: canAssign ? members.filter((m) => m.role !== "viewer") : [],
      highlights: {
        screening: outcomes.map((o) => ({
          label: o.label,
          result: screeningResult(o),
          evidence: o.evidenceVerified === false ? null : o.evidence,
        })),
        workHistory: profiles_.flatMap((p) =>
          (p.work_history ?? []).map((w) => ({
            period: w.period,
            company: w.company,
            role: w.role,
          })),
        ),
        licences: [...new Set(profiles_.flatMap((p) => p.licences ?? []))],
        skills: [...new Set(profiles_.flatMap((p) => p.skills ?? []))],
        motivation: profiles_.find((p) => p.motivation)?.motivation ?? null,
      },
      questions: {
        mode: questions?.mode ?? "standard",
        items: questions?.items ?? [],
        generated: Boolean(questions?.model) || (questions?.items.length ?? 0) > 0,
      },
      evaluations: evaluations.map((e) => ({
        authorId: e.authorId,
        authorName: nameOf.get(e.authorId) ?? "—",
        scores: e.scores,
        comments: e.comments,
        notes: e.notes,
        recommendation: e.recommendation,
        average: averageScore(e.scores),
      })),
      transcript: transcript
        ? {
            segments: JSON.parse(decryptOptional(transcript.segmentsEnc) ?? "[]") as Segment[],
            uploadedAt: transcript.updatedAt.toISOString(),
          }
        : null,
      report: report
        ? {
            status: report.status,
            scores: report.scores,
            total: report.total === null ? null : Number(report.total),
            summary: report.summary,
            needs: report.needs,
            error: report.error,
            rank,
          }
        : null,
      decision: decision
        ? {
            id: decision.id,
            decision: decision.decision,
            effectiveAt: decision.effectiveAt.toISOString(),
            decidedBy: nameOf.get(decision.decidedBy ?? "") ?? "—",
          }
        : null,
    };
  });
}

type ProfileShape = {
  work_history?: { period: string; company: string; role: string }[];
  licences?: string[];
  skills?: string[];
  motivation?: string | null;
};
