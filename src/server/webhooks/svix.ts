import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Resend signs its webhooks the Svix way: HMAC-SHA256 over "{id}.{timestamp}.{body}" with the
// base64 secret after "whsec_", sent as one or more "v1,{base64}" entries in svix-signature.

const TOLERANCE_SECONDS = 5 * 60;

export function verifySvix(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now: Date;
}): boolean {
  const { id, timestamp, signature } = input;
  if (!id || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  if (
    !Number.isFinite(sentAt) ||
    Math.abs(input.now.getTime() / 1000 - sentAt) > TOLERANCE_SECONDS
  ) {
    return false;
  }
  const key = Buffer.from(input.secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${input.body}`).digest();
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
