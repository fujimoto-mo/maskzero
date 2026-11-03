import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { withRls } from "@/server/db/rls";
import { clients, memberships, organizations } from "@/server/db/schema";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type SessionUser = {
  userId: string;
  email: string;
  /** "aal2" once the session passed the authenticator-app step (from the JWT). */
  aal?: "aal1" | "aal2";
  /** A throwaway /demo user (app_metadata.demo, set only by server code). */
  demo?: boolean;
};

export type MemberRole = (typeof memberships.$inferSelect)["role"];

export type MemberCtx = SessionUser & {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgKind: (typeof organizations.$inferSelect)["kind"];
  clientId: string;
  clientSlug: string;
  clientName: string;
  role: MemberRole;
  /** null = every client of the org. */
  clientScope: string[] | null;
  /** R&D features switched on for the org by mask0 staff, such as "ai_interviewer". */
  featureFlags: string[];
  /** A /demo sandbox: deleted after a day, never emails anyone. */
  demo: boolean;
};

/** Whether the user has a verified authenticator app (read from the session, no network call). */
async function hasSecondFactor(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2";
}

/** The signed-in user, verified with getClaims() (JWT signature check), or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // A session only exists on a real request; this also keeps token-expiry clock reads out of
  // prerendering, which Cache Components rejects.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    demo: (claims.app_metadata as { demo?: unknown } | undefined)?.demo === true,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Resolves the org and client from the URL for the signed-in user, or 404s. A 404 rather than a 403
 * keeps other companies' slugs from being discoverable.
 */
export const requireMember = cache(
  async (orgSlug: string, clientSlug: string): Promise<MemberCtx> => {
    const user = await requireUser();
    const [row] = await withRls(user, (tx) =>
      tx
        .select({
          orgId: organizations.id,
          orgSlug: organizations.slug,
          orgName: organizations.name,
          orgKind: organizations.kind,
          clientId: clients.id,
          clientSlug: clients.slug,
          clientName: clients.name,
          role: memberships.role,
          clientScope: memberships.clientIds,
          featureFlags: organizations.featureFlags,
          demoExpiresAt: organizations.demoExpiresAt,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.orgId))
        .innerJoin(clients, eq(clients.orgId, organizations.id))
        .where(
          and(
            eq(memberships.userId, user.userId),
            eq(memberships.status, "active"),
            eq(organizations.slug, orgSlug),
            eq(clients.slug, clientSlug),
          ),
        )
        .limit(1),
    );
    if (!row) notFound();
    if (row.clientScope && !row.clientScope.includes(row.clientId)) notFound();
    const { demoExpiresAt, ...member } = row;
    const demo = demoExpiresAt !== null;
    // Owners and admins work only with a second factor, and so does anyone who set one up
    // (docs/02 M1-6, docs/05 §11). Not in a /demo sandbox: it holds no real data and its admin is
    // a throwaway user (only server code can make a company a sandbox).
    if (user.aal !== "aal2" && !demo) {
      const admin = row.role === "owner" || row.role === "admin";
      if (admin || (await hasSecondFactor())) {
        const next = encodeURIComponent(`/app/${row.orgSlug}/${row.clientSlug}/dashboard`);
        redirect(`/mfa?next=${next}${admin ? "&required=1" : ""}`);
      }
    }
    return { ...user, ...member, demo };
  },
);

const EDITOR_ROLES: MemberRole[] = ["owner", "admin", "recruiter"];

/** Owners, admins and recruiters change jobs, candidates and screening; others only read. */
export const canEdit = (ctx: MemberCtx) => EDITOR_ROLES.includes(ctx.role);

export const isAdmin = (ctx: MemberCtx) => ctx.role === "owner" || ctx.role === "admin";

/** requireMember() plus editor rights; for Server Actions that change data. */
export async function requireEditor(orgSlug: string, clientSlug: string): Promise<MemberCtx> {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!canEdit(ctx)) throw new Error("This action needs recruiter, admin or owner rights.");
  return ctx;
}

/** Where a signed-in user lands: their first org's default (or first visible) client, or null. */
export async function getHomePath(user: SessionUser): Promise<string | null> {
  const [row] = await withRls(user, (tx) =>
    tx
      .select({ orgSlug: organizations.slug, clientSlug: clients.slug, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .innerJoin(clients, eq(clients.orgId, organizations.id))
      .where(and(eq(memberships.userId, user.userId), eq(memberships.status, "active")))
      .orderBy(asc(memberships.createdAt), desc(clients.isDefault), asc(clients.name))
      .limit(1),
  );
  if (!row) return null;
  // Interviewers work on the interviews they run (docs/02 M1-4).
  return `/app/${row.orgSlug}/${row.clientSlug}/${row.role === "interviewer" ? "meetings" : "dashboard"}`;
}
