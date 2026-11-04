import { and, eq } from "drizzle-orm";
import { FAKE_INTERVIEW } from "@/features/interviews/live";
import {
  finishBotTranscript,
  ingestUtterance,
  refreshAssist,
} from "@/features/interviews/live-server";
import { getAdminDb } from "@/server/db/admin";
import { interviews } from "@/server/db/schema";
import { cleanUpMeeting, scheduleBot } from "@/server/integrations/meetings";
import { inngest } from "../client";
import {
  interviewChanged,
  liveTranscriptUpdated,
  meetingBotRequested,
  reportRequested,
} from "../events";

// Meetings outside mask0 and the meeting bot (docs/02 M8-6, M11-5, M11-7). Step results carry
// IDs, codes and counts only; what the bot hears stays encrypted in the database.

/** Time after the scheduled end before the bot's transcript is taken as final. */
const AFTER_END_MS = 15 * 60_000;
const FAKE_PAUSE = "4s";
const FAKE_LINGER = "2m";

/** A cancellation removes the calendar event, the meeting and the bot; a no-show the bot. */
export const meetingCleanup = inngest.createFunction(
  { id: "meeting-cleanup", triggers: [interviewChanged] },
  async ({ event, step }) => {
    const { interviewId, orgId } = event.data;
    return step.run("clean-up", async () => {
      const [row] = await getAdminDb()
        .select({ status: interviews.status })
        .from(interviews)
        .where(and(eq(interviews.id, interviewId), eq(interviews.orgId, orgId)));
      if (row?.status === "canceled") return { removed: await cleanUpMeeting(interviewId, orgId) };
      if (row?.status === "no_show") {
        return { removed: await cleanUpMeeting(interviewId, orgId, ["bot"]) };
      }
      return { removed: [] };
    });
  },
);

/**
 * Sends the bot to the interview, waits for the end, then keeps what it heard as the transcript
 * and asks for the AI report. In fake mode the bot "hears" a sample interview at once.
 */
export const meetingBot = inngest.createFunction(
  { id: "meeting-bot", triggers: [meetingBotRequested] },
  async ({ event, step }) => {
    const { interviewId, orgId } = event.data;
    const bot = await step.run("schedule", () => scheduleBot(interviewId, orgId, new Date()));
    if (bot.status !== "scheduled") return bot;

    if (bot.fake) {
      for (const [i, line] of FAKE_INTERVIEW.entries()) {
        await step.sleep(`pause-${i}`, FAKE_PAUSE);
        const stored = await step.run(`hear-${i}`, async () => {
          const outcome = await ingestUtterance(interviewId, {
            at: i * 20,
            speaker: line.speaker === "interviewer" ? "面接官" : "応募者",
            text: line.text,
          });
          return outcome.status;
        });
        if (stored !== "stored") break;
        await step.sendEvent(`heard-${i}`, liveTranscriptUpdated.create({ interviewId, orgId }));
      }
      // Time to look at the live page before the transcript moves to the interview page.
      await step.sleep("linger", FAKE_LINGER);
    } else {
      const end = await step.run("end-time", async () => {
        const [row] = await getAdminDb()
          .select({ endsAt: interviews.endsAt })
          .from(interviews)
          .where(eq(interviews.id, interviewId));
        return new Date((row?.endsAt ?? new Date()).getTime() + AFTER_END_MS).toISOString();
      });
      await step.sleepUntil("interview-end", end);
    }

    const finished = await step.run("finish", () => finishBotTranscript(interviewId, orgId));
    if (finished.status === "saved" && finished.report) {
      await step.sendEvent("report", reportRequested.create({ interviewId, orgId }));
    }
    return finished;
  },
);

/** New words from the meeting: the suggestions are refreshed every 15–45 seconds at most (M11-7). */
export const liveAssist = inngest.createFunction(
  {
    id: "live-assist",
    triggers: [liveTranscriptUpdated],
    debounce: { key: "event.data.interviewId", period: "15s", timeout: "45s" },
    retries: 1,
    concurrency: { key: "event.data.orgId", limit: 5 },
  },
  async ({ event, step }) => {
    const { interviewId, orgId } = event.data;
    return step.run("suggest", () => refreshAssist(interviewId, orgId));
  },
);
