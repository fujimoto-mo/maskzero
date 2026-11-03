import { NextResponse } from "next/server";
import { markSubmitted } from "@/features/intake/entry-server";
import { verifyReceipt } from "@/server/crypto/receipt";
import { applicationSubmitted, staffNotify } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { clientIpHash, withinRateLimit } from "@/server/rate-limit";

/**
 * The entry's uploads are done: start verifying, reading and screening. If the event is lost, the
 * pending-application sweep in the background jobs picks the application up later.
 */
export async function POST(request: Request) {
  if (!(await withinRateLimit(`entry:complete:${await clientIpHash()}`, 40, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { receipt?: unknown } | null;
  const applicationId = typeof body?.receipt === "string" ? verifyReceipt(body.receipt) : null;
  if (!applicationId) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const submitted = await markSubmitted(applicationId);
  if (!submitted) return NextResponse.json({ error: "notFound" }, { status: 404 });
  await sendEventBestEffort(applicationSubmitted.create({ applicationId, orgId: submitted.orgId }));
  // Once per application: the event id makes Inngest drop repeats (a re-entry, a retried request).
  await sendEventBestEffort({
    ...staffNotify.create({ applicationId, orgId: submitted.orgId, kind: "new_application" }),
    id: `new_application:${applicationId}`,
  });
  return NextResponse.json({ ok: true });
}
