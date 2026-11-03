import { z } from "zod";
import { addDays, jstDateKey, jstInstant } from "@/features/scheduling/slots";

// The AI interviewer (docs/02 M12), pure: question configs, the conversation's next step,
// bands, reminder times and how well people agree with the AI. Everything that decides is here
// or with people; the model only words follow-ups and proposes scores.

export const AI_FEATURE = "ai_interviewer";

export const MAX_QUESTIONS = 10;
export const MAX_FOLLOW_UPS = 2;
export const MAX_ANSWER_CHARS = 2000;

export const questionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(300),
  rubric: z.string().trim().max(500),
  followUps: z.number().int().min(0).max(MAX_FOLLOW_UPS),
});

export const configSchema = z.object({
  enabled: z.boolean(),
  questions: z.array(questionSchema).max(MAX_QUESTIONS),
  timeLimitMinutes: z.number().int().min(10).max(90),
  deadlineDays: z.number().int().min(2).max(14),
});
export type AiConfigInput = z.infer<typeof configSchema>;

/** Starting questions offered for a new config; the company edits them. */
export const SAMPLE_QUESTIONS: Omit<z.infer<typeof questionSchema>, "id">[] = [
  {
    text: "これまでのお仕事で、最も力を入れて取り組んだことを教えてください。",
    rubric: "役割・行動・結果が具体的に語られている。",
    followUps: 1,
  },
  {
    text: "今回の求人に応募した理由を教えてください。",
    rubric: "仕事内容への理解と、自分の経験や希望とのつながりがある。",
    followUps: 1,
  },
  {
    text: "仕事で困難にぶつかったとき、どのように乗り越えましたか。",
    rubric: "状況の捉え方と、自分で考えて動いた具体的な行動がある。",
    followUps: 1,
  },
];

export type Turn = {
  role: "ai" | "candidate";
  questionId: string;
  kind: "question" | "follow_up" | "answer" | "closing";
  text: string;
  at: string;
};

export type Progress = { currentQuestion: number; followUpsUsed: number };

export type AiSessionStatus =
  "invited" | "started" | "completed" | "scored" | "aborted" | "expired";

/** The session as the candidate's page shows it. */
export type CandidateSessionView = {
  status: AiSessionStatus;
  deadlineAt: string;
  timeLimitMinutes: number;
  /** When the time limit runs out; null before starting. */
  endsAt: string | null;
  secondsLeft: number;
  questionCount: number;
  currentQuestion: number;
  humanRequested: boolean;
  turns: Turn[];
};

export type Question = z.infer<typeof questionSchema>;

/**
 * After an answer: ask the AI's follow-up while this question allows one, else move on to the
 * next question, else close. `followUp` is the AI's proposal (null = it has enough).
 */
export function nextStep(
  questions: Question[],
  progress: Progress,
  followUp: string | null,
): { kind: "follow_up" | "question" | "closing"; text: string; progress: Progress } {
  const current = questions[progress.currentQuestion];
  if (current && followUp && progress.followUpsUsed < current.followUps) {
    return {
      kind: "follow_up",
      text: followUp,
      progress: { ...progress, followUpsUsed: progress.followUpsUsed + 1 },
    };
  }
  const next = progress.currentQuestion + 1;
  if (next < questions.length) {
    return {
      kind: "question",
      text: questions[next]!.text,
      progress: { currentQuestion: next, followUpsUsed: 0 },
    };
  }
  return {
    kind: "closing",
    text: "以上で質問は終わりです。ご回答ありがとうございました。結果は採用担当者からご連絡します。",
    progress: { currentQuestion: questions.length, followUpsUsed: 0 },
  };
}

/** The exchange about one question: its question, follow-ups and the answers. */
export function exchangeFor(turns: Turn[], questionId: string): Turn[] {
  return turns.filter((t) => t.questionId === questionId && t.kind !== "closing");
}

/** Seconds left of the time limit, never below 0; the full limit before starting. */
export function secondsLeft(startedAt: Date | null, limitMinutes: number, now: Date): number {
  if (!startedAt) return limitMinutes * 60;
  return Math.max(
    0,
    Math.round((startedAt.getTime() + limitMinutes * 60_000 - now.getTime()) / 1000),
  );
}

export const BANDS = ["A", "B", "C", "D"] as const;
export type Band = (typeof BANDS)[number];

/** A–D from the 1–5 average; a proposal for people, never a decision. */
export function bandFor(total: number): Band {
  if (total >= 4.2) return "A";
  if (total >= 3.4) return "B";
  if (total >= 2.6) return "C";
  return "D";
}

/** The deadline: 23:59 Japan time `days` days after the invitation. */
export function deadlineFor(invitedAt: Date, days: number): Date {
  return new Date(jstInstant(addDays(jstDateKey(invitedAt), days + 1), "00:00").getTime() - 60_000);
}

/** Reminders at 10:00 two days before the deadline and on its day, if still ahead (M12-5). */
export function reminderTimes(deadline: Date, now: Date): Date[] {
  const day = jstDateKey(deadline);
  return [jstInstant(addDays(day, -2), "10:00"), jstInstant(day, "10:00")].filter(
    (at) => at > now && at < deadline,
  );
}

/** "11月10日（火）23:59" in Japan time, for emails and pages. */
export function formatDeadline(deadline: Date): string {
  const local = new Date(deadline.getTime() + 9 * 3600_000);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][local.getUTCDay()];
  const hhmm = local.toISOString().slice(11, 16);
  return `${local.getUTCMonth() + 1}月${local.getUTCDate()}日（${weekday}）${hhmm}`;
}

/** P5 exit: recruiters agree with the AI band in at least this share of a blind sample. */
export const AGREEMENT_TARGET = 0.8;

export type ReviewPair = {
  aiBand: string;
  humanBand: string;
  aiTotal: number;
  humanAverage: number;
};

/**
 * How well recruiters' blind ratings agree with the AI (P5 exit: ≥ 80 % in a blind sample):
 * the share with the same band, and the mean gap between the averages.
 */
export function agreement(pairs: ReviewPair[]): {
  count: number;
  bandAgreement: number | null;
  meanGap: number | null;
} {
  if (pairs.length === 0) return { count: 0, bandAgreement: null, meanGap: null };
  const same = pairs.filter((p) => p.aiBand === p.humanBand).length;
  const gap = pairs.reduce((sum, p) => sum + Math.abs(p.aiTotal - p.humanAverage), 0);
  return { count: pairs.length, bandAgreement: same / pairs.length, meanGap: gap / pairs.length };
}
