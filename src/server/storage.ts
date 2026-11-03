import "server-only";
import { supabaseAdmin } from "@/server/supabase/admin";

export type Bucket = "documents" | "job-images";

/** Our buckets have no storage policies at all: every access goes through server code that has
 * already checked permissions. */
const storageAdmin = () => supabaseAdmin().storage;

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

/** Server-side upload, for files the app creates itself (the /demo sandbox). */
export async function uploadObject(
  bucket: Bucket,
  path: string,
  data: Buffer,
  contentType: string,
) {
  const { error } = await storageAdmin()
    .from(bucket)
    .upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage: ${error.message}`);
}

export function publicUrl(bucket: Bucket, path: string): string {
  return storageAdmin().from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function removeObjects(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storageAdmin().from(bucket).remove(paths);
  if (error) throw new Error(`Storage: ${error.message}`);
}
