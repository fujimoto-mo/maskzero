import "server-only";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { sha256 } from "@/server/crypto/tokens";
import { getAdminDb } from "@/server/db/admin";

/**
 * Fixed-window counter in Postgres. Returns false once `key` has been hit more than `limit` times
 * in the current window. One atomic upsert, so concurrent requests count correctly.
 */
export async function withinRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const [row] = await getAdminDb().execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                          then now() else rate_limits.window_start end
    returning count`);
  return Number(row?.count ?? 0) <= limit;
}

/** A hash of the caller's IP (first X-Forwarded-For hop), for rate-limit keys; never the raw IP. */
export async function clientIpHash(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for") ?? "";
  return sha256(`ip:${forwarded.split(",")[0]?.trim() || "unknown"}`).slice(0, 32);
}
