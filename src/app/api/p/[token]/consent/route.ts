import { NextResponse } from "next/server";
import { z } from "zod";
import { loadPortal } from "@/features/intake/entry-server";
import { setOtherJobsConsent, setRecordingConsent } from "@/features/pool/consent-server";
import { sha256 } from "@/server/crypto/tokens";
import { withinRateLimit } from "@/server/rate-limit";

const bodySchema = z.union([
  z.object({ otherJobs: z.boolean() }),
  z.object({ recording: z.boolean() }),
]);

/** The candidate changes a consent: job suggestions (M5-6) or interview recording (M11-5). */
export async function POST(request: Request, { params }: RouteContext<"/api/p/[token]/consent">) {
  const { token } = await params;
  if (!(await withinRateLimit(`consent:${sha256(token).slice(0, 32)}`, 20, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const portal = await loadPortal(token);
  if (!portal) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const ok =
    "otherJobs" in parsed.data
      ? await setOtherJobsConsent(portal.scope, parsed.data.otherJobs)
      : await setRecordingConsent(portal.scope, parsed.data.recording);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "notOffered" }, { status: 409 });
}
