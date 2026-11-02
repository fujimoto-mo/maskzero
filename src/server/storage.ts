import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

export type Bucket = "documents" | "job-images";

let client: ReturnType<typeof createClient> | undefined;

/**
 * Storage with the secret key, which bypasses storage policies. Our buckets have no policies at
 * all, so every access goes through server code that has already checked permissions.
 */
function storageAdmin() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set (see .env.example).");
  client ??= createClient(getPublicEnv().supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client.storage;
}

/** A one-time URL the browser uploads one file to, directly (no file passes through our functions). */
export async function createSignedUpload(bucket: Bucket, path: string) {
  const { data, error } = await storageAdmin().from(bucket).createSignedUploadUrl(path);
  if (error) throw new Error(`Storage: ${error.message}`);
  return { path: data.path, token: data.token };
}

export async function downloadObject(bucket: Bucket, path: string): Promise<Buffer> {
  const { data, error } = await storageAdmin().from(bucket).download(path);
  if (error) throw new Error(`Storage: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Short-lived link for staff to open a private document (docs/05 §8: at most five minutes). */
export async function createSignedDownload(path: string, fileName: string): Promise<string> {
  const { data, error } = await storageAdmin()
    .from("documents")
    .createSignedUrl(path, 300, { download: fileName });
  if (error) throw new Error(`Storage: ${error.message}`);
  return data.signedUrl;
}

export function publicUrl(bucket: Bucket, path: string): string {
  return storageAdmin().from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function removeObjects(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storageAdmin().from(bucket).remove(paths);
  if (error) throw new Error(`Storage: ${error.message}`);
}
