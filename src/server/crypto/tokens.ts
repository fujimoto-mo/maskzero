import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";

/** 128-bit random token for personal-page and invitation links; store only its sha256. */
export function newToken(): string {
  return randomBytes(16).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// No look-alike characters (0/O, 1/l/I), so codes survive being read aloud or retyped.
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

/** Short public code for entry links (/a/{code}). Not secret: it is pasted into job boards. */
export function newEntryCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}
