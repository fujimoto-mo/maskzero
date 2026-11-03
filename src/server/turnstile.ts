import "server-only";

// Cloudflare Turnstile on the public forms (docs/05 §11): the entry page, the contact form and the
// demo. Inactive until both keys are set; the honeypot, timing check and rate limits apply either way.

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const turnstileEnabled = () =>
  Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);

/**
 * Checks a widget token with Cloudflare. A token Cloudflare rejects fails; when Cloudflare can't be
 * reached the form goes through, because losing real applications during an outage costs more
 * than the bots the other checks still stop.
 */
export async function passesTurnstile(token: unknown, action: string): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.warn("[turnstile] verification unavailable", response.status);
      return true;
    }
    const result = (await response.json()) as { success?: boolean; action?: string };
    // Cloudflare's test keys answer without an action.
    return result.success === true && (!result.action || result.action === action);
  } catch {
    console.warn("[turnstile] verification unavailable");
    return true;
  }
}
