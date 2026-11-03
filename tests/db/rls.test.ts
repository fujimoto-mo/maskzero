// Cross-tenant isolation (docs/05 §5, item 6). Runs through the app's own withRls(), so it tests the
// real policies, grants and helper functions.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertSampleJob } from "@/features/jobs/mutations";
import { bookFirstFree, ensureCalendar } from "@/features/scheduling/server";
import { getDb } from "@/server/db/client";
import { withRls } from "@/server/db/rls";
import * as schema from "@/server/db/schema";

// These tests write to auth.users, so they only ever use a disposable database (the local stack or
// CI's), never the app's DATABASE_URL, which points at the hosted project.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.DATABASE_URL = testDatabaseUrl; // what getDb() connects to
const admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });

type User = { userId: string; email: string };
const run = randomUUID().slice(0, 8);
const newUser = (name: string): User => ({
  userId: randomUUID(),
  email: `rls-${name}-${run}@mask0.test`,
});
const alice = newUser("alice"); // owner of an agency with two clients
const bob = newUser("bob"); // owner of another company
const carol = newUser("carol"); // recruiter in alice's org, limited to the second client

let aliceOrg = "";
let bobOrg = "";
let aliceDefaultClient = "";
let aliceSecondClient = "";

async function createOrg(user: User, name: string, kind: "agency" | "inhouse") {
  const [row] = await withRls(user, (tx) =>
    tx.execute<{ created_org_id: string }>(
      sql`select created_org_id from private.create_organization(${name}, ${kind})`,
    ),
  );
  return row!.created_org_id;
}

/** The database error message of a statement that must fail. */
async function rejection(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    const e = error as Error & { cause?: unknown };
    return `${e.message} ${e.cause instanceof Error ? e.cause.message : ""}`;
  }
  throw new Error("expected the statement to be rejected");
}

beforeAll(async () => {
  for (const user of [alice, bob, carol]) {
    await admin`insert into auth.users (id, email, aud, role)
                values (${user.userId}, ${user.email}, 'authenticated', 'authenticated')`;
  }
  aliceOrg = await createOrg(alice, "アリス人材", "agency");
  bobOrg = await createOrg(bob, "ボブ工業", "inhouse");

  [{ id: aliceDefaultClient }] = await admin<{ id: string }[]>`
    select id from clients where org_id = ${aliceOrg} and is_default`;
  [{ id: aliceSecondClient }] = await admin<{ id: string }[]>`
    insert into clients (org_id, name, slug) values (${aliceOrg}, 'テスト取引先', 'second') returning id`;
  await admin`insert into memberships (org_id, user_id, role, client_ids)
              values (${aliceOrg}, ${carol.userId}, 'recruiter', ${[aliceSecondClient]})`;
  await admin`insert into events (org_id, client_id, actor, type)
              values (${aliceOrg}, ${aliceSecondClient}, 'system', 'test.second_client')`;
});

afterAll(async () => {
  await admin`delete from organizations where id = any(${[aliceOrg, bobOrg].filter(Boolean)})`;
  await admin`delete from auth.users where id = any(${[alice, bob, carol].map((u) => u.userId)})`;
  await admin.end();
  await getDb().$client.end();
});

describe("RLS coverage", () => {
  it("is enabled on every table in the public schema", async () => {
    const tables = await admin<{ relname: string }[]>`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(tables.map((t) => t.relname)).toEqual([]);
  });

  it("keeps server-only functions out of the API-exposed public schema", async () => {
    // Supabase serves `public` over REST to anyone holding the anon key; server-only functions go
    // in `private` (CLAUDE.md). This list should only grow on purpose.
    const fns = await admin<{ proname: string }[]>`
      select proname from pg_proc where pronamespace = 'public'::regnamespace order by 1`;
    expect(fns.map((f) => f.proname)).toEqual(["uuid_generate_v7"]);
  });

  it.each([
    "organizations",
    "profiles",
    "clients",
    "memberships",
    "invitations",
    "events",
    "audit_logs",
    "calendars",
    "interviews",
    "booking_requests",
    "message_templates",
    "messages",
    "custom_messages",
    "inbound_emails",
    "entry_waits",
    "notification_settings",
    "pool_suggestions",
    "interview_questions",
    "interview_evaluations",
    "interview_transcripts",
    "interview_reports",
    "interview_decisions",
  ])("gives the anon role no access to %s", async (table) => {
    const message = await rejection(
      admin.begin(async (tx) => {
        await tx`set local role anon`;
        await tx.unsafe(`select 1 from public.${table} limit 1`);
      }),
    );
    expect(message).toMatch(/permission denied/);
  });
});

describe("reads stay inside the tenant", () => {
  it("shows a member only their own organization", async () => {
    const rows = await withRls(alice, (tx) =>
      tx.select({ id: schema.organizations.id }).from(schema.organizations),
    );
    expect(rows.map((r) => r.id)).toEqual([aliceOrg]);
  });

  it("shows only the member's own clients", async () => {
    const rows = await withRls(alice, (tx) =>
      tx.select({ id: schema.clients.id }).from(schema.clients),
    );
    expect(rows.map((r) => r.id).sort()).toEqual([aliceDefaultClient, aliceSecondClient].sort());
  });

  it("shows memberships and profiles of the member's own org only", async () => {
    const memberships = await withRls(alice, (tx) =>
      tx.select({ userId: schema.memberships.userId }).from(schema.memberships),
    );
    expect(memberships.map((m) => m.userId).sort()).toEqual([alice.userId, carol.userId].sort());

    const profiles = await withRls(bob, (tx) =>
      tx.select({ id: schema.profiles.id }).from(schema.profiles),
    );
    expect(profiles.map((p) => p.id)).toEqual([bob.userId]);
  });

  it("shows events and audit logs of the member's own org only", async () => {
    const events = await withRls(bob, (tx) =>
      tx.select({ orgId: schema.events.orgId }).from(schema.events),
    );
    expect(new Set(events.map((e) => e.orgId))).toEqual(new Set([bobOrg]));

    const audit = await withRls(alice, (tx) =>
      tx.select({ orgId: schema.auditLogs.orgId }).from(schema.auditLogs),
    );
    expect(new Set(audit.map((a) => a.orgId))).toEqual(new Set([aliceOrg]));
  });
});

describe("writes stay inside the tenant", () => {
  it("rejects creating a client in another org", async () => {
    const message = await rejection(
      withRls(alice, (tx) =>
        tx.insert(schema.clients).values({ orgId: bobOrg, name: "乗っ取り", slug: "takeover" }),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("changes nothing when updating another org", async () => {
    const updated = await withRls(alice, (tx) =>
      tx
        .update(schema.organizations)
        .set({ name: "乗っ取り" })
        .where(eq(schema.organizations.id, bobOrg))
        .returning({ id: schema.organizations.id }),
    );
    expect(updated).toEqual([]);
  });

  it("rejects events for another org, and system or candidate events from users", async () => {
    const otherOrg = await rejection(
      withRls(alice, (tx) =>
        tx
          .insert(schema.events)
          .values({ orgId: bobOrg, actor: "staff", actorId: alice.userId, type: "test" }),
      ),
    );
    expect(otherOrg).toMatch(/row-level security/);

    const spoofed = await rejection(
      withRls(alice, (tx) =>
        tx.insert(schema.events).values({ orgId: aliceOrg, actor: "system", type: "test.spoof" }),
      ),
    );
    expect(spoofed).toMatch(/row-level security/);
  });

  it("lets a member append their own staff event", async () => {
    await withRls(alice, (tx) =>
      tx.insert(schema.events).values({
        orgId: aliceOrg,
        clientId: aliceDefaultClient,
        actor: "staff",
        actorId: alice.userId,
        type: "test.staff_event",
      }),
    );
  });

  it("keeps events append-only", async () => {
    const message = await rejection(
      withRls(alice, (tx) =>
        tx
          .update(schema.events)
          .set({ type: "rewritten" })
          .where(eq(schema.events.orgId, aliceOrg)),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("allows memberships only through the onboarding and invitation functions", async () => {
    const message = await rejection(
      withRls(alice, (tx) =>
        tx
          .insert(schema.memberships)
          .values({ orgId: aliceOrg, userId: bob.userId, role: "viewer" }),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("does not let users change their profile email (it follows auth.users)", async () => {
    const message = await rejection(
      withRls(alice, (tx) =>
        tx
          .update(schema.profiles)
          .set({ email: "hijack@example.com" })
          .where(eq(schema.profiles.id, alice.userId)),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });
});

describe("client scoping", () => {
  it("shows a scoped member only their clients", async () => {
    const rows = await withRls(carol, (tx) =>
      tx.select({ id: schema.clients.id }).from(schema.clients),
    );
    expect(rows.map((r) => r.id)).toEqual([aliceSecondClient]);
  });

  it("hides events of clients outside the member's scope", async () => {
    const rows = await withRls(carol, (tx) =>
      tx.select({ clientId: schema.events.clientId }).from(schema.events),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.clientId === aliceSecondClient)).toBe(true);
  });

  it("does not let a recruiter edit company settings", async () => {
    const updated = await withRls(carol, (tx) =>
      tx
        .update(schema.organizations)
        .set({ name: "変更" })
        .where(eq(schema.organizations.id, aliceOrg))
        .returning({ id: schema.organizations.id }),
    );
    expect(updated).toEqual([]);
  });
});

describe("create_organization()", () => {
  it("requires a signed-in user", async () => {
    const message = await rejection(
      admin.begin(async (tx) => {
        await tx`set local role authenticated`;
        await tx`select * from private.create_organization('名無し')`;
      }),
    );
    expect(message).toMatch(/not authenticated/);
  });

  it("cannot be called anonymously", async () => {
    const message = await rejection(
      admin.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`select * from private.create_organization('匿名')`;
      }),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("rejects a blank company name", async () => {
    const message = await rejection(createOrg(alice, "   ", "inhouse"));
    expect(message).toMatch(/1-100 characters/);
  });
});

describe("Phase 1: jobs, candidates and screening", () => {
  let defaultJob = "";
  let secondJob = "";
  let candidateId = "";
  let defaultApp = "";

  beforeAll(async () => {
    [{ id: defaultJob }] = await admin<{ id: string }[]>`
      insert into jobs (org_id, client_id, title) values (${aliceOrg}, ${aliceDefaultClient}, '営業')
      returning id`;
    [{ id: secondJob }] = await admin<{ id: string }[]>`
      insert into jobs (org_id, client_id, title) values (${aliceOrg}, ${aliceSecondClient}, '事務')
      returning id`;
    [{ id: candidateId }] = await admin<{ id: string }[]>`
      insert into candidates (org_id, name) values (${aliceOrg}, 'テスト 応募者') returning id`;
    [{ id: defaultApp }] = await admin<{ id: string }[]>`
      insert into applications (org_id, client_id, job_id, candidate_id, source)
      values (${aliceOrg}, ${aliceDefaultClient}, ${defaultJob}, ${candidateId}, 'manual')
      returning id`;
  });

  it("shows jobs, applications and candidates only inside the org and client scope", async () => {
    const jobsOf = (user: User) =>
      withRls(user, (tx) => tx.select({ id: schema.jobs.id }).from(schema.jobs));
    expect((await jobsOf(bob)).map((j) => j.id)).not.toContain(defaultJob);
    expect((await jobsOf(carol)).map((j) => j.id)).toEqual([secondJob]);

    const appsOf = (user: User) =>
      withRls(user, (tx) => tx.select({ id: schema.applications.id }).from(schema.applications));
    expect((await appsOf(alice)).map((a) => a.id)).toContain(defaultApp);
    expect(await appsOf(bob)).toEqual([]);
    expect(await appsOf(carol)).toEqual([]);

    const candidatesOf = (user: User) =>
      withRls(user, (tx) => tx.select({ id: schema.candidates.id }).from(schema.candidates));
    expect(await candidatesOf(bob)).toEqual([]);
    expect(await candidatesOf(carol)).toEqual([]); // only applied in a client carol can't see
  });

  it("creates the sample job, its settings and conditions as the new owner", async () => {
    const owner = { orgId: aliceOrg, clientId: aliceDefaultClient, userId: alice.userId };
    const jobId = await withRls(alice, (tx) => insertSampleJob(tx, owner));
    const [counts] = await admin<{ criteria: number; settings: number; events: number }[]>`
      select
        (select count(*)::int from screening_criteria where job_id = ${jobId}) as criteria,
        (select count(*)::int from screening_settings where job_id = ${jobId}) as settings,
        (select count(*)::int from events where payload->>'jobId' = ${jobId}) as events`;
    expect(counts).toEqual({ criteria: 3, settings: 1, events: 1 });
  });

  it("lets editors write jobs only in clients they may edit", async () => {
    const outside = await rejection(
      withRls(carol, (tx) =>
        tx
          .insert(schema.jobs)
          .values({ orgId: aliceOrg, clientId: aliceDefaultClient, title: "x" }),
      ),
    );
    expect(outside).toMatch(/row-level security/);
    const foreign = await rejection(
      withRls(bob, (tx) =>
        tx
          .insert(schema.jobs)
          .values({ orgId: aliceOrg, clientId: aliceDefaultClient, title: "x" }),
      ),
    );
    expect(foreign).toMatch(/row-level security/);
    await withRls(carol, (tx) =>
      tx.insert(schema.jobs).values({ orgId: aliceOrg, clientId: aliceSecondClient, title: "ok" }),
    );
  });

  it("creates candidates only through upsert_candidate, deduplicated by email", async () => {
    const direct = await rejection(
      withRls(alice, (tx) => tx.insert(schema.candidates).values({ orgId: aliceOrg, name: "x" })),
    );
    expect(direct).toMatch(/permission denied/);
    const foreign = await rejection(
      withRls(bob, (tx) =>
        tx.execute(sql`select private.upsert_candidate(${aliceOrg}, 'x', null, null, null, null)`),
      ),
    );
    expect(foreign).toMatch(/not allowed/);

    const upsert = (name: string) =>
      withRls(alice, (tx) =>
        tx.execute<{ id: string }>(
          sql`select private.upsert_candidate(${aliceOrg}, ${name}, 'enc', ${`hash-${run}`}, null, null) as id`,
        ),
      );
    const [first] = await upsert("重複 確認");
    const [again] = await upsert("別の 名前");
    expect(again!.id).toBe(first!.id);
  });

  it("records staff screening decisions only as the deciding user", async () => {
    const decision = (source: "ai" | "staff", decidedBy: string | null) =>
      withRls(alice, (tx) =>
        tx.insert(schema.screeningDecisions).values({
          orgId: aliceOrg,
          clientId: aliceDefaultClient,
          applicationId: defaultApp,
          verdict: "manual_pass",
          source,
          decidedBy,
        }),
      );
    expect(await rejection(decision("ai", null))).toMatch(/row-level security/);
    expect(await rejection(decision("staff", bob.userId))).toMatch(/row-level security/);
    await decision("staff", alice.userId);
  });

  it("keeps data requests to owners and admins", async () => {
    const message = await rejection(
      withRls(carol, (tx) =>
        tx
          .insert(schema.dataRequests)
          .values({ orgId: aliceOrg, candidateName: "x", kind: "deletion" }),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("never exposes contact inquiries or rate limits to app users", async () => {
    expect(
      await rejection(withRls(alice, (tx) => tx.select().from(schema.contactInquiries))),
    ).toMatch(/permission denied/);
    expect(await rejection(withRls(alice, (tx) => tx.select().from(schema.rateLimits)))).toMatch(
      /permission denied/,
    );
  });

  it("starts the retention clock on rejection and stops it on reopening", async () => {
    await admin`update applications set outcome = 'rejected' where id = ${defaultApp}`;
    const [closed] = await admin<{ days: number }[]>`
      select (purge_after::date - closed_at::date) as days from applications where id = ${defaultApp}`;
    expect(closed!.days).toBe(180);
    await admin`update applications set outcome = 'active' where id = ${defaultApp}`;
    const [open] = await admin<{ closed_at: Date | null; purge_after: Date | null }[]>`
      select closed_at, purge_after from applications where id = ${defaultApp}`;
    expect(open).toEqual({ closed_at: null, purge_after: null });
  });
});

describe("Phase 2: scheduling and email", () => {
  // Everything below lives in alice's default client, which carol (scoped to the second client)
  // and bob (another company) must not see.
  const CLIENT_TABLES = [
    "calendars",
    "availability_rules",
    "slot_overrides",
    "concern_options",
    "interview_invitations",
    "booking_requests",
    "interviews",
    "messages",
  ];
  let calendarId = "";
  let applicationId = "";
  let invitationId = "";

  beforeAll(async () => {
    [{ id: calendarId }] = await admin<{ id: string }[]>`
      insert into calendars (org_id, client_id, name) values (${aliceOrg}, ${aliceDefaultClient}, '面接')
      returning id`;
    await admin`insert into availability_rules (calendar_id, org_id, client_id)
                values (${calendarId}, ${aliceOrg}, ${aliceDefaultClient})`;
    await admin`insert into slot_overrides (org_id, client_id, calendar_id, starts_at, open)
                values (${aliceOrg}, ${aliceDefaultClient}, ${calendarId}, '2030-02-01T01:00:00Z', false)`;
    await admin`insert into concern_options (org_id, client_id, label, answer)
                values (${aliceOrg}, ${aliceDefaultClient}, '服装', '自由です')`;
    const [{ id: jobId }] = await admin<{ id: string }[]>`
      insert into jobs (org_id, client_id, title) values (${aliceOrg}, ${aliceDefaultClient}, '面接職')
      returning id`;
    const [{ id: candidateId }] = await admin<{ id: string }[]>`
      insert into candidates (org_id, name) values (${aliceOrg}, '面接 候補') returning id`;
    [{ id: applicationId }] = await admin<{ id: string }[]>`
      insert into applications (org_id, client_id, job_id, candidate_id, source, stage)
      values (${aliceOrg}, ${aliceDefaultClient}, ${jobId}, ${candidateId}, 'manual', 'booking')
      returning id`;
    [{ id: invitationId }] = await admin<{ id: string }[]>`
      insert into interview_invitations (org_id, client_id, application_id)
      values (${aliceOrg}, ${aliceDefaultClient}, ${applicationId}) returning id`;
    await admin`insert into booking_requests (org_id, client_id, invitation_id, preferred)
                values (${aliceOrg}, ${aliceDefaultClient}, ${invitationId}, '[]'::jsonb)`;
    await admin`insert into interviews (org_id, client_id, application_id, invitation_id, calendar_id,
                                        starts_at, ends_at, tool)
                values (${aliceOrg}, ${aliceDefaultClient}, ${applicationId}, ${invitationId},
                        ${calendarId}, '2030-02-04T01:00:00Z', '2030-02-04T02:00:00Z', 'url')`;
    await admin`insert into messages (org_id, client_id, application_id, trigger, subject,
                                      body_rendered, dedupe_key, status)
                values (${aliceOrg}, ${aliceDefaultClient}, ${applicationId}, 'pass', '件名', '本文',
                        ${`rls-${run}`}, 'dry_run')`;
  });

  it.each(CLIENT_TABLES)("shows %s only inside the org and client scope", async (table) => {
    const count = async (user: User) => {
      const [row] = await withRls(user, (tx) =>
        tx.execute<{ n: number }>(sql.raw(`select count(*)::int as n from public.${table}`)),
      );
      return row!.n;
    };
    expect(await count(alice)).toBeGreaterThan(0);
    expect(await count(bob)).toBe(0);
    expect(await count(carol)).toBe(0);
  });

  it("rejects scheduling writes in clients the member may not edit", async () => {
    const scoped = await rejection(
      withRls(carol, (tx) =>
        tx.insert(schema.interviewInvitations).values({
          orgId: aliceOrg,
          clientId: aliceDefaultClient,
          applicationId,
          round: 2,
        }),
      ),
    );
    expect(scoped).toMatch(/row-level security/);
    const foreign = await rejection(
      withRls(bob, (tx) =>
        tx
          .insert(schema.calendars)
          .values({ orgId: aliceOrg, clientId: aliceDefaultClient, name: "乗っ取り" }),
      ),
    );
    expect(foreign).toMatch(/row-level security/);
  });

  it("refuses an overlapping interview on the same calendar", async () => {
    // The exclusion constraint is the last line against double booking (docs/05 §9).
    const overlapping = await rejection(
      withRls(alice, (tx) =>
        tx.insert(schema.interviews).values({
          orgId: aliceOrg,
          clientId: aliceDefaultClient,
          applicationId,
          calendarId,
          startsAt: new Date("2030-02-04T01:30:00Z"),
          endsAt: new Date("2030-02-04T02:30:00Z"),
          tool: "url",
        }),
      ),
    );
    expect(overlapping).toMatch(/interviews_no_overlap/);
  });

  it("keeps the send log read-only for staff", async () => {
    const message = await rejection(
      withRls(alice, (tx) =>
        tx.insert(schema.messages).values({
          orgId: aliceOrg,
          clientId: aliceDefaultClient,
          applicationId,
          trigger: "pass",
          subject: "偽装",
          bodyRendered: "偽装",
          dedupeKey: `spoof-${run}`,
        }),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("lets every member read the company's email templates, and only admins change them", async () => {
    const template = (user: User) =>
      withRls(user, (tx) =>
        tx
          .insert(schema.messageTemplates)
          .values({ orgId: aliceOrg, trigger: "reminder", subject: "件名", body: "{interview_at}" })
          .onConflictDoNothing(),
      );
    expect(await rejection(template(carol))).toMatch(/row-level security/);
    expect(await rejection(template(bob))).toMatch(/row-level security/);
    await template(alice);

    const visible = (user: User) =>
      withRls(user, (tx) =>
        tx
          .select({ orgId: schema.messageTemplates.orgId })
          .from(schema.messageTemplates)
          .where(eq(schema.messageTemplates.orgId, aliceOrg)),
      );
    expect(await visible(carol)).toHaveLength(1);
    expect(await visible(bob)).toEqual([]);
  });

  it("lets staff confirm a slot by hand under their own policies", async () => {
    const scope = { orgId: aliceOrg, clientId: aliceDefaultClient };
    const startsAt = new Date("2030-02-05T10:00:00+09:00"); // a Tuesday
    const booked = await withRls(alice, async (tx) => {
      const { rules } = await ensureCalendar(tx, scope);
      return bookFirstFree(tx, {
        ...scope,
        applicationId,
        invitationId,
        calendarId,
        rules,
        round: 1,
        preferred: [{ startsAt, endsAt: new Date(startsAt.getTime() + 3600_000) }],
        now: new Date("2030-02-04T09:00:00+09:00"),
        actor: { kind: "staff", userId: alice.userId },
      });
    });
    expect(booked?.slot.startsAt).toEqual(startsAt);
    const [state] = await admin<{ stage: string; invitation: string }[]>`
      select a.stage, i.status as invitation from applications a
      join interview_invitations i on i.application_id = a.id
      where a.id = ${applicationId}`;
    expect(state).toEqual({ stage: "scheduled", invitation: "booked" });
  });
});

describe("Phase 3: automation, inbound mail and the talent pool", () => {
  let jobId = "";
  let applicationId = "";
  let candidateId = "";

  beforeAll(async () => {
    [{ id: jobId }] = await admin<{ id: string }[]>`
      insert into jobs (org_id, client_id, title, status)
      values (${aliceOrg}, ${aliceDefaultClient}, 'プール職', 'published') returning id`;
    [{ id: candidateId }] = await admin<{ id: string }[]>`
      insert into candidates (org_id, name) values (${aliceOrg}, 'プール 候補') returning id`;
    [{ id: applicationId }] = await admin<{ id: string }[]>`
      insert into applications (org_id, client_id, job_id, candidate_id, source, other_jobs_opt_in)
      values (${aliceOrg}, ${aliceDefaultClient}, ${jobId}, ${candidateId}, 'manual', true)
      returning id`;
    await admin`insert into consents (org_id, client_id, candidate_id, application_id, kind, granted, text_version)
                values (${aliceOrg}, ${aliceDefaultClient}, ${candidateId}, ${applicationId}, 'other_jobs', true, 'test')`;
    // A matched reply, and an unmatched notification that only admins may see.
    await admin`insert into inbound_emails (org_id, client_id, application_id, kind)
                values (${aliceOrg}, ${aliceDefaultClient}, ${applicationId}, 'candidate_reply')`;
    await admin`insert into inbound_emails (org_id, kind) values (${aliceOrg}, 'other')`;
    await admin`insert into entry_waits (org_id, client_id, job_id, channel, applicant_name)
                values (${aliceOrg}, ${aliceDefaultClient}, ${jobId}, 'Indeed', '待ち 太郎')`;
  });

  it.each(["inbound_emails", "entry_waits"])(
    "shows %s only inside the client scope",
    async (table) => {
      const count = async (user: User) => {
        const [row] = await withRls(user, (tx) =>
          tx.execute<{ n: number }>(sql.raw(`select count(*)::int as n from public.${table}`)),
        );
        return row!.n;
      };
      expect(await count(alice)).toBeGreaterThan(0);
      expect(await count(bob)).toBe(0);
      expect(await count(carol)).toBe(0);
    },
  );

  it("keeps unmatched inbound mail to owners and admins", async () => {
    const unmatched = (user: User) =>
      withRls(user, (tx) =>
        tx
          .select({ id: schema.inboundEmails.id })
          .from(schema.inboundEmails)
          .where(sql`${schema.inboundEmails.clientId} is null`),
      );
    expect(await unmatched(alice)).toHaveLength(1);
    expect(await unmatched(carol)).toEqual([]);
  });

  it("lets only owners and admins write custom emails", async () => {
    const write = (user: User) =>
      withRls(user, (tx) =>
        tx.insert(schema.customMessages).values({
          orgId: aliceOrg,
          name: "テスト",
          anchor: "applied",
          subject: "件名",
          body: "本文",
        }),
      );
    expect(await rejection(write(carol))).toMatch(/row-level security/);
    expect(await rejection(write(bob))).toMatch(/row-level security/);
    await write(alice);
  });

  it("keeps each member's notification settings to themselves", async () => {
    await withRls(alice, (tx) =>
      tx
        .insert(schema.notificationSettings)
        .values({ orgId: aliceOrg, userId: alice.userId, emailKinds: ["needs_review"] }),
    );
    const spoof = await rejection(
      withRls(carol, (tx) =>
        tx
          .insert(schema.notificationSettings)
          .values({ orgId: aliceOrg, userId: alice.userId, emailKinds: [] }),
      ),
    );
    expect(spoof).toMatch(/row-level security/);
    const seen = await withRls(carol, (tx) => tx.select().from(schema.notificationSettings));
    expect(seen).toEqual([]);
  });

  it("records talent-pool suggestions only as the suggesting editor, within scope", async () => {
    const suggest = (user: User, suggestedBy: string) =>
      withRls(user, (tx) =>
        tx.insert(schema.poolSuggestions).values({
          orgId: aliceOrg,
          clientId: aliceDefaultClient,
          jobId,
          candidateId,
          sourceApplicationId: applicationId,
          suggestedBy,
        }),
      );
    expect(await rejection(suggest(alice, bob.userId))).toMatch(/row-level security/);
    expect(await rejection(suggest(carol, carol.userId))).toMatch(/row-level security/);
    await suggest(alice, alice.userId);
  });

  it("lets admins change a member's role and scope, never an owner's", async () => {
    const promoted = await withRls(alice, (tx) =>
      tx
        .update(schema.memberships)
        .set({ role: "viewer", clientIds: [aliceSecondClient] })
        .where(eq(schema.memberships.userId, carol.userId))
        .returning({ role: schema.memberships.role }),
    );
    expect(promoted).toEqual([{ role: "viewer" }]);
    await admin`update memberships set role = 'recruiter' where user_id = ${carol.userId}`;
    const owner = await withRls(alice, (tx) =>
      tx
        .update(schema.memberships)
        .set({ role: "viewer" })
        .where(eq(schema.memberships.userId, alice.userId))
        .returning({ role: schema.memberships.role }),
    );
    expect(owner).toEqual([]);
  });
});

describe("Phase 4: interviewers see only the interviews they run", () => {
  const ivy = newUser("ivy"); // interviewer in alice's org
  let calendarId = "";
  let jobId = "";
  let mineApp = "";
  let mineCandidate = "";
  let otherApp = "";
  let otherCandidate = "";
  let mineInterview = "";
  let otherInterview = "";

  beforeAll(async () => {
    await admin`insert into auth.users (id, email, aud, role)
                values (${ivy.userId}, ${ivy.email}, 'authenticated', 'authenticated')`;
    await admin`insert into memberships (org_id, user_id, role)
                values (${aliceOrg}, ${ivy.userId}, 'interviewer')`;
    [{ id: calendarId }] = await admin<{ id: string }[]>`
      insert into calendars (org_id, client_id, owner_user_id, name)
      values (${aliceOrg}, ${aliceDefaultClient}, ${alice.userId}, '面接官テスト') returning id`;
    [{ id: jobId }] = await admin<{ id: string }[]>`
      insert into jobs (org_id, client_id, title) values (${aliceOrg}, ${aliceDefaultClient}, '面接官職')
      returning id`;
    const app = async (name: string) => {
      const [{ id: candidate }] = await admin<{ id: string }[]>`
        insert into candidates (org_id, name) values (${aliceOrg}, ${name}) returning id`;
      const [{ id }] = await admin<{ id: string }[]>`
        insert into applications (org_id, client_id, job_id, candidate_id, source, stage)
        values (${aliceOrg}, ${aliceDefaultClient}, ${jobId}, ${candidate}, 'manual', 'scheduled')
        returning id`;
      return { id, candidate };
    };
    ({ id: mineApp, candidate: mineCandidate } = await app("担当 候補"));
    ({ id: otherApp, candidate: otherCandidate } = await app("担当外 候補"));
    const interview = async (applicationId: string, at: string, interviewers: string[]) => {
      const [{ id }] = await admin<{ id: string }[]>`
        insert into interviews (org_id, client_id, application_id, calendar_id, starts_at, ends_at,
                                tool, interviewer_ids)
        values (${aliceOrg}, ${aliceDefaultClient}, ${applicationId}, ${calendarId}, ${at}::timestamptz,
                ${at}::timestamptz + interval '1 hour', 'url', ${interviewers}::uuid[])
        returning id`;
      return id;
    };
    mineInterview = await interview(mineApp, "2030-03-04T01:00:00Z", [ivy.userId]);
    otherInterview = await interview(otherApp, "2030-03-05T01:00:00Z", []);
    await admin`insert into events (org_id, client_id, application_id, actor, type)
                values (${aliceOrg}, ${aliceDefaultClient}, ${mineApp}, 'system', 'test.mine'),
                       (${aliceOrg}, ${aliceDefaultClient}, ${otherApp}, 'system', 'test.other')`;
  });

  afterAll(async () => {
    await admin`delete from auth.users where id = ${ivy.userId}`;
  });

  it("shows the interviewer their interview, its application and candidate, and nothing else", async () => {
    const ids = async <T extends { id: string }>(q: Promise<T[]>) => (await q).map((r) => r.id);
    const apps = await ids(
      withRls(ivy, (tx) => tx.select({ id: schema.applications.id }).from(schema.applications)),
    );
    expect(apps).toEqual([mineApp]);
    const people = await ids(
      withRls(ivy, (tx) => tx.select({ id: schema.candidates.id }).from(schema.candidates)),
    );
    expect(people).toEqual([mineCandidate]);
    expect(people).not.toContain(otherCandidate);
    const meetings = await ids(
      withRls(ivy, (tx) => tx.select({ id: schema.interviews.id }).from(schema.interviews)),
    );
    expect(meetings).toEqual([mineInterview]);
    const timeline = await withRls(ivy, (tx) =>
      tx.select({ applicationId: schema.events.applicationId }).from(schema.events),
    );
    expect(timeline.some((e) => e.applicationId === otherApp)).toBe(false);
    expect(timeline.some((e) => e.applicationId === mineApp)).toBe(true);
  });

  it("keeps the client and its job postings visible, so the workspace opens", async () => {
    const clients = await withRls(ivy, (tx) =>
      tx.select({ id: schema.clients.id }).from(schema.clients),
    );
    expect(clients.map((c) => c.id)).toContain(aliceDefaultClient);
    const jobs = await withRls(ivy, (tx) => tx.select({ id: schema.jobs.id }).from(schema.jobs));
    expect(jobs.map((j) => j.id)).toContain(jobId);
  });

  it("lets the interviewer evaluate their own interview only, as themselves", async () => {
    const evaluate = (interviewId: string, applicationId: string, authorId: string) =>
      withRls(ivy, (tx) =>
        tx.insert(schema.interviewEvaluations).values({
          orgId: aliceOrg,
          clientId: aliceDefaultClient,
          applicationId,
          interviewId,
          authorId,
          scores: { experience: 4 },
        }),
      );
    await evaluate(mineInterview, mineApp, ivy.userId);
    expect(await rejection(evaluate(otherInterview, otherApp, ivy.userId))).toMatch(
      /row-level security/,
    );
    expect(await rejection(evaluate(mineInterview, mineApp, alice.userId))).toMatch(
      /row-level security/,
    );
  });

  it("leaves decisions to editors", async () => {
    const decide = (user: User) =>
      withRls(user, (tx) =>
        tx.insert(schema.interviewDecisions).values({
          orgId: aliceOrg,
          clientId: aliceDefaultClient,
          applicationId: mineApp,
          interviewId: mineInterview,
          decision: "pass",
          decidedBy: user.userId,
          previous: {},
          effectiveAt: new Date(Date.now() + 600_000),
        }),
      );
    expect(await rejection(decide(ivy))).toMatch(/row-level security/);
    expect(await rejection(decide(carol))).toMatch(/row-level security/);
    await decide(alice);
  });

  it("still shows a recruiter everything in their clients", async () => {
    const apps = await withRls(alice, (tx) =>
      tx.select({ id: schema.applications.id }).from(schema.applications),
    );
    expect(apps.map((a) => a.id)).toEqual(expect.arrayContaining([mineApp, otherApp]));
  });
});

describe("accept_invitation()", () => {
  it("joins only with the invited address, and only once", async () => {
    const dave = newUser("dave");
    await admin`insert into auth.users (id, email, aud, role)
                values (${dave.userId}, ${dave.email}, 'authenticated', 'authenticated')`;
    try {
      const tokenHash = `invite-${run}`;
      await admin`insert into invitations (org_id, email, role, token_hash, expires_at)
                  values (${aliceOrg}, ${dave.email}, 'recruiter', ${tokenHash}, now() + interval '1 day')`;
      const accept = (user: User) =>
        withRls(user, (tx) =>
          tx.execute<{ org_slug: string }>(
            sql`select * from private.accept_invitation(${tokenHash})`,
          ),
        );
      expect(await rejection(accept(bob))).toMatch(/different email/);
      const [joined] = await accept(dave);
      expect(joined?.org_slug).toBeTruthy();
      const [membership] = await admin<{ role: string }[]>`
        select role from memberships where org_id = ${aliceOrg} and user_id = ${dave.userId}`;
      expect(membership?.role).toBe("recruiter");
      expect(await rejection(accept(dave))).toMatch(/invalid or expired/);

      // An invitation limited to the second client lands there, not on the default client.
      const erin = newUser("erin");
      await admin`insert into auth.users (id, email, aud, role)
                  values (${erin.userId}, ${erin.email}, 'authenticated', 'authenticated')`;
      try {
        const scopedHash = `invite-scoped-${run}`;
        await admin`insert into invitations (org_id, email, role, client_ids, token_hash, expires_at)
                    values (${aliceOrg}, ${erin.email}, 'recruiter', ${[aliceSecondClient]},
                            ${scopedHash}, now() + interval '1 day')`;
        const [landed] = await withRls(erin, (tx) =>
          tx.execute<{ client_slug: string }>(
            sql`select * from private.accept_invitation(${scopedHash})`,
          ),
        );
        expect(landed?.client_slug).toBe("second");
      } finally {
        await admin`delete from auth.users where id = ${erin.userId}`;
      }
    } finally {
      await admin`delete from auth.users where id = ${dave.userId}`;
    }
  });
});
