import "server-only";
import { sql } from "drizzle-orm";
import { getDb, type Tx } from "./client";

/**
 * Runs fn in one transaction as the `authenticated` role with the user's JWT claims, so the RLS
 * policies in supabase/migrations apply on top of the app's own org/client filters (docs/05 §5).
 * A plain connection would bypass RLS; this switch is what makes it count.
 */
export async function withRls<T>(ctx: { userId: string }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    const claims = JSON.stringify({ sub: ctx.userId, role: "authenticated" });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
