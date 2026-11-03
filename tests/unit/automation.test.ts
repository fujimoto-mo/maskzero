import { describe, expect, it } from "vitest";
import {
  type AppSteps,
  byBoard,
  funnel,
  openRateByHour,
  periodFor,
  reached,
  responseLag,
  worstStep,
} from "@/features/analytics/domain";
import { hasRoom, planFor } from "@/features/billing/plans";
import {
  cleanName,
  detectBoard,
  extractApplicantName,
  matchJob,
  nameKey,
  parseNotification,
  replyText,
} from "@/features/inbound/parse";
import { nudgeIsValid, renderNudge } from "@/features/inbound/nudge";
import { interviewReminders, timingAt } from "@/features/scheduling/slots";
import { renderConcerns, timingsFor, validateTemplate } from "@/features/scheduling/templates";

const jst = (s: string) => new Date(`${s}+09:00`);

describe("send times (M9-3)", () => {
  const anchor = jst("2026-11-04T14:30:00");

  it("maps each timing to Japan-time instants", () => {
    expect(timingAt("immediately", anchor)).toEqual(anchor);
    expect(timingAt("same_day_18", anchor)).toEqual(jst("2026-11-04T18:00:00"));
    expect(timingAt("next_day_10", anchor)).toEqual(jst("2026-11-05T10:00:00"));
    expect(timingAt("plus_3d_10", anchor)).toEqual(jst("2026-11-07T10:00:00"));
    expect(timingAt("plus_1w_10", anchor)).toEqual(jst("2026-11-11T10:00:00"));
  });

  it("sends 'same day 18:00' right away once 18:00 has passed", () => {
    const late = jst("2026-11-04T19:10:00");
    expect(timingAt("same_day_18", late)).toEqual(late);
  });

  it("counts 'day before 18:00' back from the interview, and needs one", () => {
    expect(timingAt("day_before_18", anchor, jst("2026-11-09T10:00:00"))).toEqual(
      jst("2026-11-08T18:00:00"),
    );
    expect(timingAt("day_before_18", anchor)).toBeNull();
  });

  it("offers 'day before' only to custom emails that follow a booking", () => {
    expect(timingsFor("interview_scheduled")).toContain("day_before_18");
    expect(timingsFor("applied")).not.toContain("day_before_18");
  });

  it("lists the interview reminders still ahead, earliest first", () => {
    const start = jst("2026-11-16T14:00:00");
    expect(interviewReminders(start, jst("2026-11-04T12:00:00")).map((r) => r.trigger)).toEqual([
      "remind_5d",
      "remind_3d",
      "reminder",
      "interview_day",
    ]);
    // Booked four days ahead: the 5-day note is already past.
    const soon = interviewReminders(start, jst("2026-11-12T12:00:00"));
    expect(soon.map((r) => r.trigger)).toEqual(["remind_3d", "reminder", "interview_day"]);
    expect(soon[0]!.at).toEqual(jst("2026-11-13T10:00:00"));
    // An interview at 07:30 gets no 08:00 "today" email.
    const early = interviewReminders(jst("2026-11-16T07:30:00"), jst("2026-11-04T12:00:00"));
    expect(early.map((r) => r.trigger)).not.toContain("interview_day");
  });
});

describe("templates (M9-2)", () => {
  it("requires the entry link and the opt-out link in talent-pool suggestions", () => {
    const problems = validateTemplate("pool_suggestion", { subject: "求人", body: "{name}様" });
    expect(problems).toEqual([
      { code: "missingField", field: "entry_url" },
      { code: "missingField", field: "consent_url" },
    ]);
  });

  it("checks custom emails only for blanks and unknown fields", () => {
    expect(validateTemplate(null, { subject: "件名", body: "{name} {booking_url}" })).toEqual([]);
    expect(validateTemplate(null, { subject: "件名", body: "{nickname}" })).toEqual([
      { code: "unknownField", field: "nickname" },
    ]);
  });

  it("renders concerns with an intro, and nothing when there are none", () => {
    expect(renderConcerns([])).toBe("");
    expect(renderConcerns([{ label: "服装", answer: "自由です" }])).toContain("■服装\n自由です");
  });
});

describe("job-board notifications (M3-10)", () => {
  const jobs = [
    { id: "j1", title: "営業" },
    { id: "j2", title: "法人営業（東京）" },
  ];

  it("recognises the board by sender, forwarded sender, or name in the subject", () => {
    expect(detectBoard({ from: "no-reply@jp.indeed.com", subject: "", text: "" })).toBe("Indeed");
    expect(
      detectBoard({
        from: "me@company.example",
        subject: "Fwd: 応募のお知らせ",
        text: "---------- Forwarded message ---------\nFrom: doda <info@mail.doda.jp>\n",
      }),
    ).toBe("doda");
    expect(detectBoard({ from: "x@example.com", subject: "【バイトル】新着応募", text: "" })).toBe(
      "バイトル",
    );
    expect(detectBoard({ from: "x@example.com", subject: "請求書", text: "" })).toBeNull();
  });

  it("finds the applicant's name in common phrasings", () => {
    expect(extractApplicantName("", "応募者：山田 太郎 様\n求人：営業")).toBe("山田 太郎");
    expect(extractApplicantName("佐藤花子さんから応募がありました", "")).toBe("佐藤花子");
    expect(extractApplicantName("倉庫スタッフ：山田　花子さんから応募がありました", "")).toBe(
      "山田 花子",
    );
    expect(extractApplicantName("【新着応募】鈴木 一郎さん", "")).toBe("鈴木 一郎");
    expect(extractApplicantName("お知らせ", "本文")).toBeNull();
  });

  it("rejects things that are not names and matches names regardless of spacing", () => {
    expect(cleanName("https://example.com")).toBeNull();
    expect(cleanName("12345")).toBeNull();
    expect(nameKey("山田　太郎")).toBe(nameKey("山田太郎"));
  });

  it("matches the longest job title in the email", () => {
    expect(matchJob("【応募】法人営業（東京）", "", jobs)).toBe("j2");
    expect(matchJob("", "営業職へのご応募", jobs)).toBe("j1");
    expect(matchJob("事務", "", jobs)).toBeNull();
  });

  it("says why a notification could not be used", () => {
    const base = { from: "no-reply@indeed.com", jobs };
    expect(parseNotification({ ...base, subject: "お知らせ", text: "" })).toEqual({
      ok: false,
      channel: "Indeed",
      reason: "name",
    });
    expect(
      parseNotification({ ...base, subject: "山田太郎さんから応募がありました", text: "事務" }),
    ).toEqual({ ok: false, channel: "Indeed", reason: "job" });
    expect(
      parseNotification({ ...base, subject: "山田太郎さんから応募がありました", text: "営業" }),
    ).toEqual({ ok: true, channel: "Indeed", applicantName: "山田太郎", jobId: "j1" });
  });

  it("keeps only what the candidate wrote above the quoted email", () => {
    expect(replyText("ありがとうございます。\n伺います。\n\n> 元のメール\n> 本文")).toBe(
      "ありがとうございます。\n伺います。",
    );
    expect(replyText("了解です\nOn Mon, Nov 2, 2026 mask0 wrote:\nquoted")).toBe("了解です");
  });

  it("fills the nudge text and insists on {URL}", () => {
    expect(
      renderNudge("{name}様 {job} {URL}", { name: "山田", job: "営業", url: "https://x" }),
    ).toBe("山田様 営業 https://x");
    expect(nudgeIsValid("こんにちは")).toBe(false);
    expect(nudgeIsValid("こちらから {URL}")).toBe(true);
  });
});

describe("analytics (M10)", () => {
  const d = (s: string) => jst(s);
  const row = (over: Partial<AppSteps>): AppSteps => ({
    channel: "Indeed",
    entered: d("2026-11-01T09:00:00"),
    passed: null,
    opened: null,
    scheduled: null,
    held: null,
    offer: null,
    hired: null,
    ...over,
  });
  const rows = [
    row({}),
    row({ passed: d("2026-11-01T10:00:00") }),
    row({
      passed: d("2026-11-01T10:00:00"),
      opened: d("2026-11-01T10:30:00"),
      scheduled: d("2026-11-01T12:00:00"),
    }),
    // A booking without a recorded page view still counts as having opened the invitation.
    row({ channel: "doda", passed: d("2026-11-02T21:00:00"), scheduled: d("2026-11-05T09:00:00") }),
  ];

  it("counts later steps as passing earlier ones", () => {
    expect(reached(rows[3]!, "opened")).toBe(true);
    expect(funnel(rows).map((s) => s.count)).toEqual([4, 3, 2, 2, 0, 0, 0]);
  });

  it("highlights the weakest step only with enough people before it", () => {
    const steps = funnel(rows);
    expect(worstStep(steps, 5)).toBeNull();
    expect(worstStep(steps, 2)).toBe("held");
  });

  it("buckets how fast invitations were opened against interviews", () => {
    const lag = responseLag(rows);
    expect(lag.find((b) => b.bucket === "hour")).toEqual({
      bucket: "hour",
      count: 1,
      interviewRate: 1,
    });
    expect(lag.find((b) => b.bucket === "never")?.count).toBe(2);
  });

  it("summarises per board, busiest first, and opens by send hour", () => {
    const boards = byBoard(rows);
    expect(boards.map((b) => [b.channel, b.volume])).toEqual([
      ["Indeed", 3],
      ["doda", 1],
    ]);
    expect(boards[1]!.interviewRate).toBe(1);
    expect(openRateByHour(rows).map((h) => [h.hour, h.sent, h.opened])).toEqual([
      [10, 2, 1],
      [21, 1, 0],
    ]);
  });

  it("works out periods in Japan time", () => {
    const now = jst("2026-11-03T08:00:00");
    expect(periodFor("m", now)).toEqual({ key: "m", from: "2026-11-01", to: "2026-11-04" });
    expect(periodFor("p", now)).toEqual({ key: "p", from: "2026-10-01", to: "2026-11-01" });
    expect(periodFor("c", now, { from: "2026-10-10", to: "2026-10-20" })).toEqual({
      key: "c",
      from: "2026-10-10",
      to: "2026-10-21",
    });
    expect(periodFor("c", now, { from: "2026-10-20", to: "2026-10-10" }).key).toBe("m");
  });
});

describe("plans (M13-4)", () => {
  it("falls back to the trial plan and treats null as unlimited", () => {
    expect(planFor("unknown").id).toBe("trial");
    expect(hasRoom(null, 10_000)).toBe(true);
    expect(hasRoom(5, 4)).toBe(true);
    expect(hasRoom(5, 5)).toBe(false);
  });
});
