import { NextResponse } from "next/server";
import { z } from "zod";
import { loadPortal } from "@/features/intake/entry-server";
import { setOtherJobsConsent } from "@/features/pool/consent-server";
import { sha256 } from "@/server/crypto/tokens";
import { withinRateLimit } from "@/server/rate-limit";

const bodySchema = z.object({ otherJobs: z.boolean() });

/** The candidate starts or stops suggestions of other jobs (docs/02 M3-8, M5-6). */
export async function POST(request: Request, { params }: RouteContext<"/api/p/[token]/consent">) {
  const { token } = await params;
  if (!(await withinRateLimit(`consent:${sha256(token).slice(0, 32)}`, 20, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const portal = await loadPortal(token);
  if (!portal) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const ok = await setOtherJobsConsent(portal.scope, parsed.data.otherJobs);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "notOffered" }, { status: 409 });
}
