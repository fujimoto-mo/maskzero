import "server-only";
import { timingSafeEqual } from "node:crypto";

// Inbound-mail providers (Postmark and others) call webhooks with credentials in the URL, which
// arrive as an HTTP Basic Authorization header. Only the password is checked.

export function basicAuthMatches(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const password = Buffer.from(decoded.slice(decoded.indexOf(":") + 1));
  const expected = Buffer.from(secret);
  return password.length === expected.length && timingSafeEqual(password, expected);
}
