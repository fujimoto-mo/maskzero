import { ALL_FIELDS, payUnit, SECTIONS, type SectionId } from "./fields";
import type { PostingFields } from "./schema";

// Pre-posting checks (docs/02 M2-3). Errors are likely to fail a board's review or break Japanese
// job-ad rules and keep a job from "ready"; warnings cost applications. Pure: no I/O.

export type PostingIssue = {
  level: "error" | "warning";
  board: "common" | "indeed" | "engage";
  section: SectionId | "images" | "period";
  /** Key under Jobs.checks in the messages. */
  code:
    | "required"
    | "tooLong"
    | "periodOrder"
    | "titleWords"
    | "discriminatoryRequirement"
    | "insuranceIncomplete"
    | "fixedOvertimeDetails"
    | "payRangeOrder"
    | "lowHourlyPay"
    | "noMainImage"
    | "smallImage"
    | "fewImages";
  params?: Record<string, string | number>;
};

export type PostingContext = {
  postingFrom: string | null;
  postingTo: string | null;
  images: { slot: number; width: number; height: number }[];
};

// Words a job title must not contain: employment types, company or pay wording, "inexperienced
// welcome", urgency, decorative symbols.
const TITLE_WORDS =
  /正社員|契約社員|アルバイト|パート|派遣|業務委託|未経験|急募|高収入|株式会社|有限会社|万円|月給|時給|[！!★☆【】■◆♪]/;
// Requirements must not limit by age, gender or nationality (雇用対策法・男女雇用機会均等法).
const DISCRIMINATORY =
  /\d+\s*(歳|才)|歳まで|歳以下|代まで|若手|男性のみ|女性のみ|男性限定|女性限定|日本人/;
// Rough floor for hourly pay; prefecture minimum wages change every October.
const HOURLY_FLOOR_YEN = 1000;

function isBlank(value: unknown): boolean {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || String(value).trim() === "";
}

export function checkPosting(f: PostingFields, ctx: PostingContext): PostingIssue[] {
  const issues: PostingIssue[] = [];
  const add = (issue: PostingIssue) => issues.push(issue);

  for (const section of SECTIONS) {
    for (const field of section.fields) {
      const value = field.key === "pay" ? (f.payMin ?? f.payMax ?? null) : f[field.key];
      const board = field.boards?.length === 1 ? field.boards[0] : "common";
      if (field.required && isBlank(value)) {
        add({
          level: "error",
          board,
          section: section.id,
          code: "required",
          params: { field: field.label },
        });
      }
      if (field.maxLength && typeof value === "string" && value.length > field.maxLength.chars) {
        add({
          level: "warning",
          board: field.maxLength.board,
          section: section.id,
          code: "tooLong",
          params: { field: field.label, max: field.maxLength.chars, count: value.length },
        });
      }
    }
  }

  if (!ctx.postingFrom) {
    add({
      level: "error",
      board: "common",
      section: "period",
      code: "required",
      params: { field: "掲載期間" },
    });
  } else if (ctx.postingTo && ctx.postingTo < ctx.postingFrom) {
    add({ level: "error", board: "common", section: "period", code: "periodOrder" });
  }

  if (f.title && TITLE_WORDS.test(f.title)) {
    add({ level: "error", board: "common", section: "basic", code: "titleWords" });
  }
  if (DISCRIMINATORY.test(`${f.mustHave ?? ""}\n${f.niceToHave ?? ""}`)) {
    add({ level: "error", board: "common", section: "req", code: "discriminatoryRequirement" });
  }
  if (f.payMin != null && f.payMax != null && f.payMin > f.payMax) {
    add({ level: "error", board: "common", section: "pay", code: "payRangeOrder" });
  }
  if (f.payType === "時給" && f.payMin != null && f.payMin < HOURLY_FLOOR_YEN) {
    add({
      level: "warning",
      board: "common",
      section: "pay",
      code: "lowHourlyPay",
      params: { yen: HOURLY_FLOOR_YEN },
    });
  }
  const fixedOvertime = f.fixedOvertime?.trim() ?? "";
  if (
    fixedOvertime &&
    !/^なし/.test(fixedOvertime) &&
    !(/時間/.test(fixedOvertime) && /円/.test(fixedOvertime))
  ) {
    add({ level: "warning", board: "common", section: "pay", code: "fixedOvertimeDetails" });
  }
  if (
    (f.employmentType === "正社員" || f.employmentType === "契約社員") &&
    (f.insurance?.length ?? 0) < 4
  ) {
    add({ level: "warning", board: "indeed", section: "benefit", code: "insuranceIncomplete" });
  }

  if (!ctx.images.some((image) => image.slot === 1)) {
    add({ level: "error", board: "common", section: "images", code: "noMainImage" });
  }
  for (const image of ctx.images) {
    if (image.width < 800 || image.height < 600) {
      add({
        level: "warning",
        board: "indeed",
        section: "images",
        code: "smallImage",
        params: { slot: image.slot, width: image.width, height: image.height },
      });
    }
  }
  if (ctx.images.length < 3) {
    add({
      level: "warning",
      board: "common",
      section: "images",
      code: "fewImages",
      params: { count: ctx.images.length },
    });
  }
  return issues;
}

export const isReadyToPost = (issues: PostingIssue[]) => !issues.some((i) => i.level === "error");

/** "300万円〜450万円" style text, or "" when no amount is set. */
export function formatPay(f: PostingFields): string {
  if (f.payMin == null && f.payMax == null) return "";
  const unit = payUnit(f.payType);
  const amount = (n: number | null | undefined) =>
    n == null ? "" : `${n.toLocaleString("ja-JP")}${unit}`;
  return `${f.payType ?? ""} ${amount(f.payMin)}〜${amount(f.payMax)}`.trim();
}

/** Field keys that hold free text, for "fill with AI" and paste views. */
export const TEXT_FIELD_KEYS = ALL_FIELDS.filter(
  (f) => f.type === "text" || f.type === "textarea",
).map((f) => f.key);
