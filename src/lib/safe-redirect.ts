/**
 * Returns `value` only if it is a same-site relative path, otherwise `fallback`. Guards redirect
 * targets taken from query strings and forms (`?next=`) against open redirects such as
 * `//evil.example` or `/\evil.example`.
 */
export function safeRedirectPath(value: unknown, fallback = "/app"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  try {
    const base = "http://mask0.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
