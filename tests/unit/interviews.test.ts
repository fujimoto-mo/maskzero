import { describe, expect, it } from "vitest";
import {
  averageScore,
  formatTime,
  locateQuote,
  parseTranscript,
  rankAmong,
  renderTranscript,
} from "@/features/interviews/rubric";

describe("transcripts (M11-5)", () => {
  it("reads WebVTT with speakers and times", () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v 面接官>本日はよろしくお願いします。

00:01:05.500 --> 00:01:12.000
<v 応募者>前職では法人営業を5年担当しました。</v>`;
    expect(parseTranscript(vtt)).toEqual([
      { t: 1, speaker: "面接官", text: "本日はよろしくお願いします。" },
      { t: 65, speaker: "応募者", text: "前職では法人営業を5年担当しました。" },
    ]);
  });

  it("reads SRT and plain text with 'name: words' lines", () => {
    const srt = "1\r\n00:00:02,000 --> 00:00:03,000\r\n応募者: はい、大丈夫です。\r\n";
    expect(parseTranscript(srt)).toEqual([{ t: 2, speaker: "応募者", text: "はい、大丈夫です。" }]);
    expect(
      parseTranscript("面接官：志望動機を教えてください。\n\n貴社の理念に惹かれました。"),
    ).toEqual([
      { t: null, speaker: "面接官", text: "志望動機を教えてください。" },
      { t: null, speaker: null, text: "貴社の理念に惹かれました。" },
    ]);
  });

  it("formats times and renders numbered lines for the AI", () => {
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(3725)).toBe("1:02:05");
    expect(formatTime(null)).toBe("");
    expect(renderTranscript([{ t: 65, speaker: "応募者", text: "はい" }])).toBe(
      "[0 1:05] 応募者: はい",
    );
  });

  it("finds quotes in the transcript and flags invented ones", () => {
    const segments = [{ t: 65, speaker: "応募者", text: "前職では法人営業を５年担当しました。" }];
    expect(locateQuote("法人営業を5年", segments)).toEqual({ t: 65, verified: true });
    expect(locateQuote("リーダーとして10人を率いた", segments)).toEqual({
      t: null,
      verified: false,
    });
  });
});

describe("ratings (M11-3, M11-6)", () => {
  it("averages the rated criteria only", () => {
    expect(averageScore({ experience: 4, motivation: 2 })).toBe(3);
    expect(averageScore({ experience: 9, unknown: 5 })).toBeNull();
  });

  it("ranks a total among the others of the same job and round", () => {
    expect(rankAmong(3.4, [4, 2.8, 3.4])).toEqual({ rank: 2, of: 4 });
    expect(rankAmong(3, [])).toEqual({ rank: 1, of: 1 });
  });
});
