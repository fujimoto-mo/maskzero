import { NextResponse } from "next/server";
import {
  createSandbox,
  type Sandbox,
  sandboxesFull,
  sandboxOf,
  signInToSandbox,
} from "@/features/demo/server";
import { getSessionUser } from "@/server/auth/session";
import { clientIpHash, withinRateLimit } from "@/server/rate-limit";
import { passesTurnstile } from "@/server/turnstile";

const urlFor = (sandbox: Sandbox, view: "admin" | "candidate") =>
  view === "candidate" && sandbox.entryCode
    ? `/a/${sandbox.entryCode}`
    : `/app/${sandbox.orgSlug}/${sandbox.clientSlug}/dashboard`;

/**
 * Opens the visitor's /demo sandbox, creating it and signing them in on first use (docs/02 M0-4).
 * 200 `{ url }`; 409 when a real account is signed in; 429, 400 (Turnstile) and 503 (too many
 * sandboxes) otherwise.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    view?: unknown;
    turnstileToken?: unknown;
  } | null;
  const view = body?.view === "candidate" ? "candidate" : "admin";
  const now = new Date();

  const user = await getSessionUser();
  if (user && !user.demo) return NextResponse.json({ error: "signedIn" }, { status: 409 });
  if (user) {
    const sandbox = await sandboxOf(user.userId, now);
    if (sandbox) return NextResponse.json({ url: urlFor(sandbox, view) });
  }

  if (!(await withinRateLimit(`demo:${await clientIpHash()}`, 5, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  if (!(await passesTurnstile(body?.turnstileToken, "demo"))) {
    return NextResponse.json({ error: "challenge" }, { status: 400 });
  }
  if (await sandboxesFull(now)) return NextResponse.json({ error: "busy" }, { status: 503 });

  try {
    const sandbox = await createSandbox(now);
    await signInToSandbox(sandbox.email);
    return NextResponse.json({ url: urlFor(sandbox, view) });
  } catch (error) {
    console.error("[demo] sandbox failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
