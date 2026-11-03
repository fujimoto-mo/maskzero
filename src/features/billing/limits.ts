import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db, Tx } from "@/server/db/client";
import { aiUsage, clients, jobs, organizations } from "@/server/db/schema";
import { hasRoom, type Plan, planFor } from "./plans";

// Plan limits on the server (docs/02 M13-4). Callers pass their connection: a withRls()
// transaction for staff actions, the admin connection for background jobs.

type Conn = Db | Tx;

export type Usage = { clients: number; publishedJobs: number; aiUsdThisMonth: number };

/** Midnight on the 1st of the current month in Japan, as an instant. */
export function monthStartJst(now: Date): Date {
  const local = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 9 * 3600_000);
}

export async function loadPlan(conn: Conn, orgId: string): Promise<Plan> {
  const [org] = await conn
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  return planFor(org?.plan ?? "trial");
}

export async function loadUsage(conn: Conn, orgId: string, now: Date): Promise<Usage> {
  const [[c], [j], [ai]] = await Promise.all([
    conn
      .select({ n: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.orgId, orgId)),
    conn
      .select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.status, "published"))),
    conn
      .select({ usd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float8` })
      .from(aiUsage)
      .where(and(eq(aiUsage.orgId, orgId), gte(aiUsage.createdAt, monthStartJst(now)))),
  ]);
  return { clients: c?.n ?? 0, publishedJobs: j?.n ?? 0, aiUsdThisMonth: ai?.usd ?? 0 };
}

/** Whether one more client or published job fits the org's plan. */
export async function checkPlanLimit(
  conn: Conn,
  orgId: string,
  limit: "clients" | "publishedJobs",
): Promise<boolean> {
  const [plan, usage] = await Promise.all([
    loadPlan(conn, orgId),
    loadUsage(conn, orgId, new Date()),
  ]);
  return hasRoom(plan.limits[limit], usage[limit]);
}

/** True once this month's AI spend reached the plan's quota; reading and screening then pause. */
export async function aiQuotaReached(conn: Conn, orgId: string, now: Date): Promise<boolean> {
  const [plan, usage] = await Promise.all([loadPlan(conn, orgId), loadUsage(conn, orgId, now)]);
  const limit = plan.limits.aiUsdPerMonth;
  return limit !== null && usage.aiUsdThisMonth >= limit;
}
