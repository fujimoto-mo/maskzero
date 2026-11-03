import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { clients } from "@/server/db/schema";

export type ClientOption = { id: string; name: string; slug: string; isDefault: boolean };

/** Clients the member can see (RLS applies their client scope), default first. */
export async function listClientOptions(ctx: MemberCtx): Promise<ClientOption[]> {
  return withRls(ctx, (tx) =>
    tx
      .select({
        id: clients.id,
        name: clients.name,
        slug: clients.slug,
        isDefault: clients.isDefault,
      })
      .from(clients)
      .where(eq(clients.orgId, ctx.orgId))
      .orderBy(sql`${clients.isDefault} desc`, asc(clients.name)),
  );
}

export type ClientRow = ClientOption & {
  publishedJobs: number;
  activeApplications: number;
  createdAt: string;
};

/** The agency's client companies with a little activity for the clients page (docs/02 M1-1). */
export async function listClients(ctx: MemberCtx): Promise<ClientRow[]> {
  const rows = await withRls(ctx, (tx) =>
    tx.execute<{
      id: string;
      name: string;
      slug: string;
      is_default: boolean;
      published_jobs: number;
      active_applications: number;
      created_at: string;
    }>(sql`
      select c.id, c.name, c.slug, c.is_default, c.created_at,
        (select count(*)::int from jobs j where j.client_id = c.id and j.status = 'published') as published_jobs,
        (select count(*)::int from applications a where a.client_id = c.id and a.outcome = 'active') as active_applications
      from clients c
      where c.org_id = ${ctx.orgId}
      order by c.is_default desc, c.name`),
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isDefault: r.is_default,
    publishedJobs: r.published_jobs,
    activeApplications: r.active_applications,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
