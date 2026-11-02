import "server-only";
import { getDb, type Db } from "./client";

/**
 * Database access that BYPASSES Row Level Security, for code with no staff session: background
 * jobs, webhooks and candidate token endpoints. Take orgId from the job payload or the resolved
 * token, and filter every query by it.
 */
export function getAdminDb(): Db {
  return getDb();
}
