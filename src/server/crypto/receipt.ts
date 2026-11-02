import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { deriveKey } from "./pii";

// A short-lived proof that this browser just made an entry for an application, so it can say
// "uploads finished" without holding the personal-page token (which repeat entries never reveal).

let key: Buffer | undefined;
const sign = (payload: string) =>
  createHmac("sha256", (key ??= deriveKey("mask0/entry-receipt/v1")))
    .update(payload)
    .digest("base64url");

export function signReceipt(applicationId: string, ttlSeconds = 3600): string {
  const payload = `${applicationId}.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  return `${payload}.${sign(payload)}`;
}

/** The application id, or null when the receipt is forged or expired. */
export function verifyReceipt(receipt: string): string | null {
  const [id, exp, signature] = receipt.split(".");
  if (!id || !exp || !signature) return null;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(exp) * 1000 >= Date.now() ? id : null;
}
