import { NextResponse } from "next/server";
import { z } from "zod";
import { parseRecallTranscript } from "@/features/interviews/live";
import { ingestUtterance } from "@/features/interviews/live-server";
import { verifyBotWebhookToken } from "@/server/integrations/meetings";
import { liveTranscriptUpdated } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";

// The meeting bot's real-time transcript (docs/02 M11-5): Recall.ai posts each utterance here.
// The path carries the interview and a secret derived from it, which Recall calls exactly as
// given. Anything else gets a 2xx too, so Recall doesn't retry what we chose to drop.

const MAX_BYTES = 64_000;

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/webhooks/recall/[interviewId]/[token]">,
) {
  const { interviewId, token } = await params;
  if (!z.uuid().safeParse(interviewId).success || !verifyBotWebhookToken(interviewId, token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ ok: true, ignored: "tooLarge" });
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: "invalid" });
  }
  const utterance = parseRecallTranscript(payload);
  if (!utterance) return NextResponse.json({ ok: true, ignored: "event" });
  const outcome = await ingestUtterance(interviewId, utterance);
  if (outcome.status === "stored") {
    await sendEventBestEffort(liveTranscriptUpdated.create({ interviewId, orgId: outcome.orgId }));
  }
  return NextResponse.json({ ok: true });
}
