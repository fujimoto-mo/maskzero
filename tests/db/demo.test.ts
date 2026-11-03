// The /demo sandbox builder (docs/02 M0-4) on the database: one transaction that creates an
// agency, its jobs and applicants already screened and booked, through the app's own functions.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type BuiltDemo, buildDemo } from "@/features/demo/build";
import { DEMO_EMAIL_DOMAIN, DEMO_HISTORY, DEMO_PEOPLE } from "@/features/demo/template";
import { getDb } from "@/server/db/client";

// Never the app's DATABASE_URL, which points at the hosted project (see rls.test.ts).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.DATABASE_URL = testDatabaseUrl; // what getDb() connects to
process.env.PII_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
const admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });

const userId = randomUUID();
const now = new Date();
let built: BuiltDemo;

beforeAll(async () => {
  await admin`insert into auth.users (id, email, aud, role)
              values (${userId}, ${`${userId}@${DEMO_EMAIL_DOMAIN}`}, 'authenticated', 'authenticated')`;
  built = await getDb().transaction((tx) => buildDemo(tx, { userId, now }));
}, 60_000);

afterAll(async () => {
  if (built) await admin`delete from organizations where id = ${built.orgId}`;
  await admin`delete from auth.users where id = ${userId}`;
  await admin.end();
  await getDb().$client.end();
});

describe("demo sandbox", () => {
  it("is an agency run by its throwaway admin, gone in a day and never sending", async () => {
    const [org] = await admin<
      { kind: string; plan: string; test_mode: boolean; demo_expires_at: Date }[]
    >`select kind, plan, test_mode, demo_expires_at from organizations where id = ${built.orgId}`;
    expect(org).toMatchObject({ kind: "agency", plan: "demo", test_mode: true });
    expect(org!.demo_expires_at.getTime() - now.getTime()).toBe(24 * 3600_000);
    const members = await admin<{ role: string }[]>`
      select role from memberships where org_id = ${built.orgId}`;
    expect(members).toEqual([{ role: "admin" }]);
  });

  it("publishes a job per client, with entry URLs for the candidate view", async () => {
    const jobs = await admin<{ status: string; criteria: number; urls: number }[]>`
      select j.status,
             (select count(*)::int from screening_criteria c where c.job_id = j.id) as criteria,
             (select count(*)::int from entry_urls u where u.job_id = j.id and u.enabled) as urls
      from jobs j where j.org_id = ${built.orgId}`;
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job).toMatchObject({ status: "published" });
      expect(job.criteria).toBe(5);
      expect(job.urls).toBeGreaterThanOrEqual(2);
    }
    const [entry] = await admin<{ n: number }[]>`
      select count(*)::int as n from entry_urls where code = ${built.entryCode}`;
    expect(entry!.n).toBe(1);
  });

  it("screens the applicants with documents to the verdicts their files were made for", async () => {
    const rows = await admin<{ name: string; verdict: string; flags: Record<string, boolean> }[]>`
      select c.name, a.verdict, r.flags
      from applications a
      join candidates c on c.id = a.candidate_id
      join screening_runs r on r.application_id = a.id
      where a.org_id = ${built.orgId}`;
    expect(rows).toHaveLength(DEMO_PEOPLE.length);
    for (const person of DEMO_PEOPLE) {
      const row = rows.find((r) => r.name === person.name);
      expect(row?.verdict, person.key).toBe(person.verdict);
      expect(row?.flags.unverifiedEvidence, person.key).toBeUndefined();
    }
    const [docs] = await admin<{ n: number }[]>`
      select count(*)::int as n from documents
      where org_id = ${built.orgId} and status = 'ready' and read_status = 'done' and transcript <> ''`;
    expect(docs!.n).toBe(built.uploads.length);
  });

  it("invites every pass and books one interview per job through the calendar", async () => {
    const passes = DEMO_PEOPLE.filter((p) => p.verdict === "pass").length;
    const [invited] = await admin<{ n: number }[]>`
      select count(*)::int as n from interview_invitations where org_id = ${built.orgId}`;
    expect(invited!.n).toBe(passes);
    const interviews = await admin<{ status: string; starts_at: Date; stage: string }[]>`
      select i.status, i.starts_at, a.stage
      from interviews i join applications a on a.id = i.application_id
      where i.org_id = ${built.orgId}`;
    expect(interviews).toHaveLength(2);
    for (const i of interviews) {
      expect(i).toMatchObject({ status: "scheduled", stage: "scheduled" });
      expect(i.starts_at.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("keeps past applicants for the dashboard and contact details encrypted", async () => {
    const [counts] = await admin<{ total: number; hired: number }[]>`
      select count(*)::int as total, count(*) filter (where outcome = 'hired')::int as hired
      from applications where org_id = ${built.orgId}`;
    expect(counts!.total).toBe(DEMO_PEOPLE.length + DEMO_HISTORY.length);
    expect(counts!.hired).toBe(DEMO_HISTORY.filter((h) => h.end === "hired").length);
    const emails = await admin<{ email_enc: string }[]>`
      select email_enc from candidates where org_id = ${built.orgId} and email_enc is not null`;
    expect(emails).toHaveLength(DEMO_PEOPLE.length);
    for (const e of emails) expect(e.email_enc).not.toContain("@");
  });
});
