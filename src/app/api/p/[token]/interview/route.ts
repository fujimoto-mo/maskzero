import { NextResponse } from "next/server";
import { z } from "zod";
import { changeInterviewByCandidate } from "@/features/interviews/candidate-server";
import { loadPortal } from "@/features/intake/entry-server";
import { sha256 } from "@/server/crypto/tokens";
import { interviewChanged } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { withinRateLimit } from "@/server/rate-limit";

const bodySchema = z.object({ action: z.enum(["reschedule", "withdraw"]) });

/** The candidate reschedules their interview or withdraws from the process (docs/02 M8-5). */
export async function POST(request: Request, { params }: RouteContext<"/api/p/[token]/interview">) {
  const { token } = await params;
  if (!(await withinRateLimit(`booking:${sha256(token).slice(0, 32)}`, 20, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const portal = await loadPortal(token);
  if (!portal) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const result = await changeInterviewByCandidate(portal.scope, parsed.data.action, new Date());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  // Stops the confirmation's pending reminder.
  for (const interviewId of result.canceled) {
    await sendEventBestEffort(interviewChanged.create({ interviewId, orgId: portal.scope.orgId }));
  }
  return NextResponse.json({ ok: true });
}
