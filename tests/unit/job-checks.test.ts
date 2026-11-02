import { describe, expect, it } from "vitest";
import {
  checkPosting,
  formatPay,
  isReadyToPost,
  type PostingContext,
} from "@/features/jobs/checks";
import { pasteGroups } from "@/features/jobs/paste";
import { SAMPLE_JOB_FIELDS } from "@/features/jobs/sample";

const fullImages: PostingContext["images"] = [
  { slot: 1, width: 1200, height: 900 },
  { slot: 2, width: 1200, height: 900 },
  { slot: 3, width: 1200, height: 900 },
];
const ctx = (over: Partial<PostingContext> = {}): PostingContext => ({
  postingFrom: "2026-11-01",
  postingTo: null,
  images: fullImages,
  ...over,
});
const codes = (issues: ReturnType<typeof checkPosting>) => issues.map((i) => i.code);

describe("checkPosting", () => {
  it("passes the sample job once it has images", () => {
    const issues = checkPosting(SAMPLE_JOB_FIELDS, ctx());
    expect(issues).toEqual([]);
    expect(isReadyToPost(issues)).toBe(true);
  });

  it("reports the missing main image of the sample job as an error", () => {
    const issues = checkPosting(SAMPLE_JOB_FIELDS, ctx({ images: [] }));
    expect(codes(issues)).toEqual(["noMainImage", "fewImages"]);
    expect(isReadyToPost(issues)).toBe(false);
  });

  it("requires the 2024 scope-of-change disclosures and the smoking measure", () => {
    const rest = { ...SAMPLE_JOB_FIELDS, workplaceChange: "", dutyChange: "", smoking: "" };
    const fields = checkPosting(rest, ctx())
      .filter((i) => i.code === "required")
      .map((i) => i.params?.field);
    expect(fields).toEqual(["就業場所の変更の範囲", "受動喫煙防止措置", "業務の変更の範囲"]);
  });

  it.each(["正社員の法人営業", "【急募】法人営業", "営業 月給30万円", "未経験歓迎の営業"])(
    "rejects the title %j",
    (title) => {
      expect(codes(checkPosting({ ...SAMPLE_JOB_FIELDS, title }, ctx()))).toContain("titleWords");
    },
  );

  it.each(["35歳まで", "20代まで活躍中", "男性のみ", "日本人の方"])(
    "rejects requirements that discriminate: %j",
    (mustHave) => {
      expect(codes(checkPosting({ ...SAMPLE_JOB_FIELDS, mustHave }, ctx()))).toContain(
        "discriminatoryRequirement",
      );
    },
  );

  it("checks the period, pay range and fixed overtime wording", () => {
    const issues = checkPosting(
      { ...SAMPLE_JOB_FIELDS, payMin: 40, payMax: 30, fixedOvertime: "あり" },
      ctx({ postingTo: "2026-10-01" }),
    );
    expect(codes(issues)).toEqual(
      expect.arrayContaining(["periodOrder", "payRangeOrder", "fixedOvertimeDetails"]),
    );
  });

  it("warns about engage's length limit and small images without blocking", () => {
    const issues = checkPosting(
      { ...SAMPLE_JOB_FIELDS, description: "あ".repeat(751) },
      ctx({ images: [{ slot: 1, width: 640, height: 480 }, ...fullImages.slice(1)] }),
    );
    expect(codes(issues)).toEqual(["tooLong", "smallImage"]);
    expect(isReadyToPost(issues)).toBe(true);
  });
});

describe("formatPay and paste views", () => {
  it("uses 万円 for monthly pay and 円 for hourly pay", () => {
    expect(formatPay(SAMPLE_JOB_FIELDS)).toBe("月給 28万円〜40万円");
    expect(formatPay({ payType: "時給", payMin: 1200, payMax: 1500 })).toBe(
      "時給 1,200円〜1,500円",
    );
  });

  it("puts the scope-of-change disclosures into every board's paste view", () => {
    for (const board of ["indeed", "engage", "other"] as const) {
      const text = pasteGroups(board, SAMPLE_JOB_FIELDS)
        .flatMap((g) => g.rows.map((r) => r.value))
        .join("\n");
      expect(text).toContain("【業務の変更の範囲】会社の定める業務");
      expect(text).toContain("【就業場所の変更の範囲】会社の定める事業所");
    }
  });
});
