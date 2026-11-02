// Cross-tenant isolation (docs/05 §5, item 6). Runs through the app's own withRls(), so it tests the
// real policies, grants and helper functions.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertSampleJob } from "@/features/jobs/mutations";
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
    } finally {
      await admin`delete from auth.users where id = ${dave.userId}`;
    }
  });
});
