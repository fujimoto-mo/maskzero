import { NextResponse } from "next/server";
import { loadPortal, markSubmitted } from "@/features/intake/entry-server";
import { sha256 } from "@/server/crypto/tokens";
import { applicationSubmitted } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { withinRateLimit } from "@/server/rate-limit";

/**
 * The candidate's uploads are done: start verifying, reading and screening. If the event is lost,
 * the pending-application sweep (server/jobs/functions) picks the application up later.
 */
export async function POST(_request: Request, { params }: RouteContext<"/api/p/[token]/submit">) {
  const { token } = await params;
  if (!(await withinRateLimit(`portal:${sha256(token).slice(0, 32)}`, 30, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const portal = await loadPortal(token);
  if (!portal) return NextResponse.json({ error: "notFound" }, { status: 404 });
  if (!portal.view.uploadsAllowed) return NextResponse.json({ error: "closed" }, { status: 409 });

  await markSubmitted(portal.scope.applicationId);
  await sendEventBestEffort(
    applicationSubmitted.create({
      applicationId: portal.scope.applicationId,
      orgId: portal.scope.orgId,
    }),
  );
  return NextResponse.json({ ok: true });
}
