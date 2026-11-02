import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { withRls } from "@/server/db/rls";
import { clients, memberships, organizations } from "@/server/db/schema";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type SessionUser = { userId: string; email: string };

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
};

/** The signed-in user, verified with getClaims() (JWT signature check), or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // A session only exists on a real request; this also keeps token-expiry clock reads out of
  // prerendering, which Cache Components rejects.
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : "" };
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
    return { ...user, ...row };
  },
);

/** Where a signed-in user lands: their first org's default (or first visible) client, or null. */
export async function getHomePath(user: SessionUser): Promise<string | null> {
  const [row] = await withRls(user, (tx) =>
    tx
      .select({ orgSlug: organizations.slug, clientSlug: clients.slug })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .innerJoin(clients, eq(clients.orgId, organizations.id))
      .where(and(eq(memberships.userId, user.userId), eq(memberships.status, "active")))
      .orderBy(asc(memberships.createdAt), desc(clients.isDefault), asc(clients.name))
      .limit(1),
  );
  return row ? `/app/${row.orgSlug}/${row.clientSlug}/dashboard` : null;
}
