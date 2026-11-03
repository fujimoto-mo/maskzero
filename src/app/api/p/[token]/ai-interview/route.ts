import { NextResponse } from "next/server";
import { z } from "zod";
import {
  answerAiInterview,
  loadAiSession,
  requestHumanInterview,
  startAiInterview,
} from "@/features/ai-interview/candidate-server";
import { MAX_ANSWER_CHARS } from "@/features/ai-interview/domain";
import { loadPortal } from "@/features/intake/entry-server";
import { afterSchedulingChange } from "@/features/interviews/server";
import { sha256 } from "@/server/crypto/tokens";
import { aiInterviewCompleted, aiInterviewStarted } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { withinRateLimit } from "@/server/rate-limit";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), consent: z.literal(true) }),
  // A little over the limit so the server, not the parser, answers "too long".
  z.object({ action: z.literal("answer"), text: z.string().max(MAX_ANSWER_CHARS * 2) }),
  z.object({ action: z.literal("human") }),
]);

/**
 * The candidate's side of the AI interview (docs/02 M12-2): start after consenting, answer, or
 * ask for an interview with a person instead. Answers the session as the page shows it.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/p/[token]/ai-interview">,
) {
  const { token } = await params;
  if (!(await withinRateLimit(`ai-interview:${sha256(token).slice(0, 32)}`, 120, 3600))) {
    return NextResponse.json({ error: "rateLimited" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const portal = await loadPortal(token);
  if (!portal) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const { scope } = portal;
  const orgId = scope.orgId;

  switch (parsed.data.action) {
    case "start": {
      const result = await startAiInterview(scope, new Date());
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
      await sendEventBestEffort(aiInterviewStarted.create({ sessionId: result.sessionId, orgId }));
      break;
    }
    case "answer": {
      const result = await answerAiInterview(scope, parsed.data.text, new Date());
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.error === "notOpen" ? 409 : 400 },
        );
      }
      if (result.completed) {
        await sendEventBestEffort(
          aiInterviewCompleted.create({ sessionId: result.sessionId, orgId }),
        );
      }
      break;
    }
    case "human": {
      const result = await requestHumanInterview(scope);
      if (!result.ok) return NextResponse.json({ error: "notOpen" }, { status: 409 });
      await afterSchedulingChange({ orgId, invitationId: result.invitationId });
      break;
    }
  }
  return NextResponse.json({ ok: true, session: await loadAiSession(scope, new Date()) });
}
