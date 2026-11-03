import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { getAdminDb } from "@/server/db/admin";
import {
  clients,
  documents,
  entryUrls,
  jobImages,
  jobs,
  memberships,
  organizations,
  profiles,
} from "@/server/db/schema";
import { removeObjects, uploadObject } from "@/server/storage";
import { supabaseAdmin } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { buildDemo } from "./build";
import { DEMO_EMAIL_DOMAIN } from "./template";

// /demo sandboxes (docs/02 M0-4, M13-6): every visitor gets their own copy of the demo company and
// a throwaway admin user, both deleted after DEMO_HOURS. Visitors never see each other's data, and
// nothing they do can email anyone: members' addresses can't receive mail, and candidate emails
// stay in the send log.

/** At most this many sandboxes exist at once; a cap on what a flood of visitors can cost. */
const MAX_LIVE_SANDBOXES = 300;

export type Sandbox = {
  orgSlug: string;
  clientSlug: string;
  entryCode: string | null;
  expiresAt: Date;
};

export async function liveSandboxCount(now: Date): Promise<number> {
  const [row] = await getAdminDb()
    .select({ n: count() })
    .from(organizations)
    .where(gt(organizations.demoExpiresAt, now));
  return row?.n ?? 0;
}

export const sandboxesFull = async (now: Date) =>
  (await liveSandboxCount(now)) >= MAX_LIVE_SANDBOXES;

/** The demo user's sandbox while it lasts, with the entry URL the candidate view opens. */
export async function sandboxOf(userId: string, now: Date): Promise<Sandbox | null> {
  const db = getAdminDb();
  const [row] = await db
    .select({
      orgId: organizations.id,
      orgSlug: organizations.slug,
      expiresAt: organizations.demoExpiresAt,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), gt(organizations.demoExpiresAt, now)))
    .limit(1);
  if (!row) return null;
  const [entry] = await db
    .select({ code: entryUrls.code, clientSlug: clients.slug })
    .from(entryUrls)
    .innerJoin(jobs, eq(jobs.id, entryUrls.jobId))
    .innerJoin(clients, eq(clients.id, entryUrls.clientId))
    .where(
      and(
        eq(entryUrls.orgId, row.orgId),
        eq(entryUrls.enabled, true),
        eq(jobs.status, "published"),
      ),
    )
    .orderBy(asc(entryUrls.createdAt))
    .limit(1);
  return {
    orgSlug: row.orgSlug,
    clientSlug: "main",
    entryCode: entry?.code ?? null,
    expiresAt: row.expiresAt!,
  };
}

/** Creates a sandbox and its user. The caller signs the visitor in with signInToSandbox(). */
export async function createSandbox(now: Date): Promise<Sandbox & { email: string }> {
  const auth = supabaseAdmin().auth.admin;
  const email = `${randomUUID()}@${DEMO_EMAIL_DOMAIN}`;
  const { data, error } = await auth.createUser({
    email,
    email_confirm: true,
    // In the JWT: getSessionUser() reads it, and demo users can't create companies of their own.
    app_metadata: { demo: true },
  });
  if (error || !data.user) throw new Error(`demo: ${error?.message ?? "no user"}`);
  const userId = data.user.id;
  let orgId: string | null = null;
  try {
    const built = await getAdminDb().transaction((tx) => buildDemo(tx, { userId, now }));
    orgId = built.orgId;
    await Promise.all(
      built.uploads.map((u) => uploadObject("documents", u.path, u.data, "application/pdf")),
    );
    return {
      orgSlug: built.orgSlug,
      clientSlug: built.clientSlug,
      entryCode: built.entryCode,
      expiresAt: built.expiresAt,
      email,
    };
  } catch (error) {
    await removeSandboxes(orgId ? [orgId] : [], [userId]);
    throw error;
  }
}

/** Signs the visitor in as the sandbox's user, with a one-time link that is never sent anywhere. */
export async function signInToSandbox(email: string): Promise<void> {
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token)
    throw new Error(`demo: ${error?.message ?? "no link"}`);
  const supabase = await createSupabaseServerClient();
  const verified = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (verified.error) throw new Error(`demo: ${verified.error.message}`);
}

async function removeSandboxes(orgIds: string[], userIds: string[]): Promise<void> {
  const db = getAdminDb();
  if (orgIds.length > 0) {
    // Files first: a row without its file is harmless, a file without its row would never be found.
    const [docs, images] = await Promise.all([
      db
        .select({ path: documents.storagePath })
        .from(documents)
        .where(inArray(documents.orgId, orgIds)),
      db
        .select({ path: jobImages.storagePath })
        .from(jobImages)
        .where(inArray(jobImages.orgId, orgIds)),
    ]);
    await removeObjects(
      "documents",
      docs.map((d) => d.path),
    );
    await removeObjects(
      "job-images",
      images.map((i) => i.path),
    );
    await db
      .delete(organizations)
      .where(and(inArray(organizations.id, orgIds), isNotNull(organizations.demoExpiresAt)));
  }
  for (const id of userIds) {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(id);
    if (error && error.status !== 404) throw new Error(`demo: ${error.message}`);
  }
}

/** Deletes sandboxes whose time is up, with their users and files. Returns how many went. */
export async function purgeExpiredSandboxes(now: Date, limit = 50): Promise<number> {
  const db = getAdminDb();
  const expired = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(lt(organizations.demoExpiresAt, now))
    .limit(limit);
  if (expired.length === 0) return 0;
  const orgIds = expired.map((o) => o.id);
  // Only the throwaway users: their addresses are on a domain that can't exist.
  const members = await db
    .select({ userId: memberships.userId, email: profiles.email })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(inArray(memberships.orgId, orgIds));
  const userIds = members
    .filter((m) => m.email?.endsWith(`@${DEMO_EMAIL_DOMAIN}`))
    .map((m) => m.userId);
  await removeSandboxes(orgIds, userIds);
  return expired.length;
}
