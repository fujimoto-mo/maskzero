import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add the Supabase pooler URL to .env (see .env.example).",
    );
  }
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // prepare: false is required by Supabase's transaction-mode pooler (Supavisor). Hosted
  // connections are encrypted; the local Docker database has no TLS.
  const client = postgres(url, { prepare: false, max: 5, ssl: local ? false : "require" });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// One pool per server instance; survives dev hot reloads.
const globalForDb = globalThis as unknown as { mask0Db?: Db };

/**
 * The raw connection uses a privileged role that BYPASSES Row Level Security. Feature code must go
 * through withRls() (./rls.ts) or, for jobs and webhooks, getAdminDb() (./admin.ts).
 */
export function getDb(): Db {
  globalForDb.mask0Db ??= createDb();
  return globalForDb.mask0Db;
}
