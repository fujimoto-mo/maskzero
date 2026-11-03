import { describe, expect, it } from "vitest";
import {
  agreement,
  bandFor,
  configSchema,
  deadlineFor,
  exchangeFor,
  formatDeadline,
  nextStep,
  type Question,
  reminderTimes,
  secondsLeft,
  type Turn,
} from "@/features/ai-interview/domain";

const questions: Question[] = [
  { id: "q1", text: "力を入れたこと", rubric: "具体的", followUps: 1 },
  { id: "q2", text: "志望理由", rubric: "", followUps: 0 },
];

describe("nextStep", () => {
  it("asks the AI's follow-up while the question allows one", () => {
    const step = nextStep(
      questions,
      { currentQuestion: 0, followUpsUsed: 0 },
      "例を一つ教えてください。",
    );
    expect(step).toEqual({
      kind: "follow_up",
      text: "例を一つ教えてください。",
      progress: { currentQuestion: 0, followUpsUsed: 1 },
    });
  });

  it("moves on when the follow-ups are used up or the AI has enough", () => {
    const used = nextStep(questions, { currentQuestion: 0, followUpsUsed: 1 }, "もう一つ");
    expect(used).toMatchObject({ kind: "question", text: "志望理由" });
    expect(used.progress).toEqual({ currentQuestion: 1, followUpsUsed: 0 });
    expect(nextStep(questions, { currentQuestion: 0, followUpsUsed: 0 }, null).kind).toBe(
      "question",
    );
  });

  it("never asks a follow-up the question doesn't allow, and closes after the last", () => {
    const last = nextStep(questions, { currentQuestion: 1, followUpsUsed: 0 }, "追加の質問");
    expect(last.kind).toBe("closing");
    expect(last.progress.currentQuestion).toBe(2);
  });
});

describe("exchangeFor", () => {
  it("keeps one question's turns and leaves out the closing", () => {
    const at = "2030-01-01T00:00:00Z";
    const turns: Turn[] = [
      { role: "ai", questionId: "q1", kind: "question", text: "Q1", at },
      { role: "candidate", questionId: "q1", kind: "answer", text: "A1", at },
      { role: "ai", questionId: "q2", kind: "question", text: "Q2", at },
      { role: "candidate", questionId: "q2", kind: "answer", text: "A2", at },
      { role: "ai", questionId: "q2", kind: "closing", text: "以上です", at },
    ];
    expect(exchangeFor(turns, "q2").map((t) => t.text)).toEqual(["Q2", "A2"]);
  });
});

describe("secondsLeft", () => {
  const start = new Date("2030-01-01T00:00:00Z");
  it("counts down from the limit and stops at zero", () => {
    expect(secondsLeft(null, 30, start)).toBe(1800);
    expect(secondsLeft(start, 30, new Date("2030-01-01T00:10:00Z"))).toBe(1200);
    expect(secondsLeft(start, 30, new Date("2030-01-01T01:00:00Z"))).toBe(0);
  });
});

describe("bandFor", () => {
  it("maps the 1–5 average to A–D", () => {
    expect(bandFor(5)).toBe("A");
    expect(bandFor(4.2)).toBe("A");
    expect(bandFor(4.19)).toBe("B");
    expect(bandFor(3.4)).toBe("B");
    expect(bandFor(2.6)).toBe("C");
    expect(bandFor(2.59)).toBe("D");
    expect(bandFor(1)).toBe("D");
  });
});

describe("deadline and reminders", () => {
  // Tuesday 3 November 2026, 15:00 in Japan.
  const invited = new Date("2026-11-03T15:00:00+09:00");

  it("ends the deadline day at 23:59 Japan time", () => {
    const deadline = deadlineFor(invited, 7);
    expect(deadline.toISOString()).toBe("2026-11-10T14:59:00.000Z");
    expect(formatDeadline(deadline)).toBe("11月10日（火）23:59");
  });

  it("reminds two days before and on the day, at 10:00, only while still ahead", () => {
    const deadline = deadlineFor(invited, 7);
    expect(reminderTimes(deadline, invited).map((d) => d.toISOString())).toEqual([
      "2026-11-08T01:00:00.000Z",
      "2026-11-10T01:00:00.000Z",
    ]);
    expect(reminderTimes(deadline, new Date("2026-11-09T12:00:00+09:00"))).toHaveLength(1);
    // A two-day deadline skips the reminder that would come before the invitation.
    expect(reminderTimes(deadlineFor(invited, 2), invited)).toHaveLength(1);
  });
});

describe("agreement", () => {
  it("is empty without ratings", () => {
    expect(agreement([])).toEqual({ count: 0, bandAgreement: null, meanGap: null });
  });

  it("measures the shared band and the gap between averages", () => {
    const result = agreement([
      { aiBand: "A", humanBand: "A", aiTotal: 4.5, humanAverage: 4.5 },
      { aiBand: "B", humanBand: "B", aiTotal: 3.5, humanAverage: 4 },
      { aiBand: "C", humanBand: "B", aiTotal: 3, humanAverage: 3.5 },
      { aiBand: "D", humanBand: "D", aiTotal: 2, humanAverage: 2 },
    ]);
    expect(result.count).toBe(4);
    expect(result.bandAgreement).toBe(0.75);
    expect(result.meanGap).toBe(0.25);
  });
});

describe("configSchema", () => {
  it("accepts a job's settings within the limits", () => {
    expect(
      configSchema.safeParse({ enabled: true, questions, timeLimitMinutes: 30, deadlineDays: 7 })
        .success,
    ).toBe(true);
  });

  it("rejects empty questions, too many follow-ups and out-of-range limits", () => {
    const base = { enabled: true, questions, timeLimitMinutes: 30, deadlineDays: 7 };
    const bad = [
      { ...base, questions: [{ ...questions[0]!, text: "  " }] },
      { ...base, questions: [{ ...questions[0]!, followUps: 3 }] },
      { ...base, timeLimitMinutes: 5 },
      { ...base, deadlineDays: 30 },
      {
        ...base,
        questions: Array.from({ length: 11 }, (_, i) => ({ ...questions[1]!, id: `q${i}` })),
      },
    ];
    for (const input of bad) expect(configSchema.safeParse(input).success).toBe(false);
  });
});
