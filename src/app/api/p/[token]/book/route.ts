import { NextResponse } from "next/server";
import { z } from "zod";
import { submitBooking } from "@/features/interviews/candidate-server";
import { loadPortal } from "@/features/intake/entry-server";
import { sha256 } from "@/server/crypto/tokens";
import { interviewScheduled, staffNotify } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { withinRateLimit } from "@/server/rate-limit";

const bodySchema = z.object({
  slots: z
    .array(
      z.object({
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(3),
  concernIds: z.array(z.uuid()).max(20),
  memo: z.string().trim().max(500),
});

/** The candidate's preferred interview slots (docs/02 M8-3, M8-4). */
export async function POST(request: Request, { params }: RouteContext<"/api/p/[token]/book">) {
  const { token } = await params;
  if (!(await withinRateLimit(`booking:${sha256(token).slice(0, 32)}`, 20, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const portal = await loadPortal(token);
  if (!portal) return NextResponse.json({ error: "notFound" }, { status: 404 });

  const result = await submitBooking(
    portal.scope,
    {
      slots: parsed.data.slots.map((s) => ({
        startsAt: new Date(s.startsAt),
        endsAt: new Date(s.endsAt),
      })),
      concernIds: parsed.data.concernIds,
      memo: parsed.data.memo || null,
    },
    new Date(),
  );
  if (result.status === "closed") return NextResponse.json({ error: "closed" }, { status: 409 });
  if (result.status === "confirmed") {
    await sendEventBestEffort(
      interviewScheduled.create({ interviewId: result.interviewId, orgId: portal.scope.orgId }),
    );
    return NextResponse.json({
      status: "confirmed",
      slot: {
        startsAt: result.slot.startsAt.toISOString(),
        endsAt: result.slot.endsAt.toISOString(),
      },
    });
  }
  // Manual confirmation, or no pick was free: someone has to act (docs/02 M6-4).
  await sendEventBestEffort(
    staffNotify.create({
      applicationId: portal.scope.applicationId,
      orgId: portal.scope.orgId,
      kind: "booking_request",
    }),
  );
  return NextResponse.json({ status: result.status });
}
