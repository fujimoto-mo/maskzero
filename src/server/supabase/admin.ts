import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

let client: ReturnType<typeof createClient> | undefined;

/**
 * Supabase with the secret key, for storage and auth administration (demo users). It bypasses
 * every policy, so only server code that has already checked permissions may use it.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set (see .env.example).");
  client ??= createClient(getPublicEnv().supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
