import "server-only";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { normalizeEmail, normalizePhone } from "@/lib/contact";

export { normalizeEmail, normalizePhone };

// Candidate email addresses and phone numbers are stored encrypted (AES-256-GCM), with keyed
// hashes (HMAC-SHA256) for dedupe and lookup (docs/05 §11). Both keys are derived from one master
// key, PII_ENCRYPTION_KEY. Losing that key makes the stored values unreadable: back it up.

const PREFIX = "v1:";
let keys: { enc: Buffer; hash: Buffer } | undefined;

/** A purpose-specific 32-byte key derived from PII_ENCRYPTION_KEY (HKDF-SHA256). */
export function deriveKey(info: string): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error("PII_ENCRYPTION_KEY is not set (see .env.example).");
  const master = Buffer.from(raw, "base64");
  if (master.length !== 32) throw new Error("PII_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), info, 32));
}

function getKeys() {
  keys ??= { enc: deriveKey("mask0/pii/encrypt/v1"), hash: deriveKey("mask0/pii/hash/v1") };
  return keys;
}

export function encryptPii(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKeys().enc, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

export function decryptPii(value: string): string {
  if (!value.startsWith(PREFIX)) throw new Error("Unknown PII ciphertext format");
  const data = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKeys().enc, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([
    decipher.update(data.subarray(12, data.length - 16)),
    decipher.final(),
  ]).toString("utf8");
}

/** Decrypts, or returns null for a missing value. */
export const decryptOptional = (value: string | null) => (value ? decryptPii(value) : null);

export function hashPii(kind: "email" | "phone", normalized: string): string {
  return createHmac("sha256", getKeys().hash).update(`${kind}:${normalized}`).digest("base64url");
}

/** Encrypted value and lookup hash for an email or phone, or nulls when blank. */
export function protectContact(kind: "email" | "phone", raw: string | null | undefined) {
  const normalized = raw ? (kind === "email" ? normalizeEmail(raw) : normalizePhone(raw)) : "";
  if (!normalized) return { enc: null, hash: null };
  return { enc: encryptPii(normalized), hash: hashPii(kind, normalized) };
}
