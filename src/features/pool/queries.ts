import "server-only";
import { sql } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";

export type PoolRow = {
  candidateId: string;
  name: string;
  lastClient: string;
  lastJob: string;
  lastAppliedAt: string;
  lastOutcome: string;
  /** Jobs already applied to or suggested: not offered again. */
  excludedJobIds: string[];
  suggestedJobs: string[];
};

export type PoolJob = { id: string; title: string; clientName: string };

/**
 * The talent pool (docs/02 M5-6): candidates whose latest "other jobs" consent is a yes, with
 * their latest application, and the published jobs they can be suggested for. RLS limits both
 * to the clients the member can see.
 */
export async function listPool(ctx: MemberCtx): Promise<{ rows: PoolRow[]; jobs: PoolJob[] }> {
  return withRls(ctx, async (tx) => {
    const [rows, jobs] = await Promise.all([
      tx.execute<{
        candidate_id: string;
        name: string;
        client_name: string;
        job_title: string;
        applied_at: string;
        outcome: string;
        applied_job_ids: string[];
        suggested_job_ids: string[] | null;
        suggested_titles: string[] | null;
      }>(sql`
        with opted_in as (
          select distinct on (k.candidate_id) k.candidate_id, k.granted
          from consents k
          where k.org_id = ${ctx.orgId} and k.kind = 'other_jobs'
          order by k.candidate_id, k.created_at desc
        ),
        latest as (
          select distinct on (a.candidate_id) a.candidate_id, a.applied_at, a.outcome,
            cl.name as client_name, j.title as job_title
          from applications a
          join clients cl on cl.id = a.client_id
          join jobs j on j.id = a.job_id
          where a.org_id = ${ctx.orgId}
          order by a.candidate_id, a.applied_at desc
        )
        select c.id as candidate_id, c.name, l.client_name, l.job_title, l.applied_at, l.outcome,
          (select array_agg(a.job_id) from applications a where a.candidate_id = c.id) as applied_job_ids,
          (select array_agg(s.job_id) from pool_suggestions s where s.candidate_id = c.id) as suggested_job_ids,
          (select array_agg(j.title order by s.created_at) from pool_suggestions s
             join jobs j on j.id = s.job_id where s.candidate_id = c.id) as suggested_titles
        from opted_in o
        join candidates c on c.id = o.candidate_id
        join latest l on l.candidate_id = c.id
        where o.granted
        order by l.applied_at desc
        limit 300`),
      tx.execute<{ id: string; title: string; client_name: string }>(sql`
        select j.id, j.title, cl.name as client_name
        from jobs j join clients cl on cl.id = j.client_id
        where j.org_id = ${ctx.orgId} and j.status = 'published'
        order by cl.name, j.title`),
    ]);
    return {
      rows: rows.map((r) => ({
        candidateId: r.candidate_id,
        name: r.name,
        lastClient: r.client_name,
        lastJob: r.job_title,
        lastAppliedAt: new Date(r.applied_at).toISOString(),
        lastOutcome: r.outcome,
        excludedJobIds: [...(r.applied_job_ids ?? []), ...(r.suggested_job_ids ?? [])],
        suggestedJobs: r.suggested_titles ?? [],
      })),
      jobs: jobs.map((j) => ({ id: j.id, title: j.title, clientName: j.client_name })),
    };
  });
}
