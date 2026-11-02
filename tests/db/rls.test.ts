// Cross-tenant isolation (docs/05 §5, item 6). Runs through the app's own withRls(), so it tests the
// real policies, grants and helper functions.
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
