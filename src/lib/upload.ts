import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "./env";

let storage: ReturnType<typeof createClient>["storage"] | undefined;

/**
 * Sends a file from the browser straight to storage through a one-time signed upload URL made by
 * the server (src/server/storage.ts), so large files never pass through our functions. The token
 * is the only credential; the publishable key here grants no storage access by itself.
 */
export async function uploadToSignedUrl(
  bucket: "documents" | "job-images",
  path: string,
  token: string,
  file: Blob,
): Promise<void> {
  const env = getPublicEnv();
  storage ??= createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
  const { error } = await storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, { contentType: file.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}
