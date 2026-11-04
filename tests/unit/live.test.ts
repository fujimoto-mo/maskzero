import { describe, expect, it } from "vitest";
import { joinWords, parseRecallTranscript, renderLive } from "@/features/interviews/live";

// The meeting bot's real-time transcript (docs/02 M11-5, M11-7).

const payload = (words: unknown, participant: unknown = { id: 1, name: "山田 太郎" }) => ({
  event: "transcript.data",
  data: {
    data: { words, participant, language_code: "ja" },
    bot: { id: "b", metadata: {} },
  },
});

describe("live transcript", () => {
  it("joins Japanese words without spaces and other words with them", () => {
    expect(joinWords(["前職", "では", "営業", "を"])).toBe("前職では営業を");
    expect(joinWords(["I", "led", "sales"])).toBe("I led sales");
    expect(joinWords(["Excel", "が", "得意", "です"])).toBe("Excelが得意です");
    expect(joinWords(["  ", "はい"])).toBe("はい");
  });

  it("reads one utterance from Recall's transcript.data webhook", () => {
    expect(
      parseRecallTranscript(
        payload([
          { text: "前職では", start_timestamp: { relative: 12.4 }, end_timestamp: null },
          { text: "営業でした", start_timestamp: { relative: 13.1 } },
        ]),
      ),
    ).toEqual({ at: 12.4, speaker: "山田 太郎", text: "前職では営業でした" });
  });

  it("ignores other events and malformed payloads", () => {
    expect(
      parseRecallTranscript({ ...payload([{ text: "x" }]), event: "transcript.partial_data" }),
    ).toBeNull();
    expect(parseRecallTranscript(payload("words"))).toBeNull();
    expect(parseRecallTranscript(payload([{ text: 3 }]))).toBeNull();
    expect(parseRecallTranscript(null)).toBeNull();
    expect(parseRecallTranscript("transcript.data")).toBeNull();
    expect(parseRecallTranscript(payload([{ text: "はい" }], null))).toEqual({
      at: null,
      speaker: null,
      text: "はい",
    });
  });

  it("renders times and speakers for the AI", () => {
    expect(
      renderLive([
        { at: 65.2, speaker: "面接官", text: "自己紹介をお願いします。" },
        { at: null, speaker: null, text: "はい。" },
      ]),
    ).toBe("[01:05] 面接官：自己紹介をお願いします。\n話者：はい。");
  });
});
