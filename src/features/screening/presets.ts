import type { ChoicesConfig, DropdownConfig, RangeConfig } from "./domain";

// Standard entry-page questions every job asks (docs/02 M3-3) and the "commonly used conditions"
// (docs/02 M4-2). Option values are stored in answers and compared as-is.

export const START_TIMINGS = ["すぐに", "1か月以内", "3か月以内", "3か月より先"] as const;

export const PAY_BANDS = [
  "こだわらない",
  "300万円未満",
  "300〜349万円",
  "350〜399万円",
  "400〜449万円",
  "450〜499万円",
  "500〜549万円",
  "550〜599万円",
  "600〜699万円",
  "700万円以上",
] as const;

/** Answer keys for the standard questions (application_answers.key). */
export const STANDARD_ANSWER_KEYS = { payBand: "pay_band", startTiming: "start_timing" } as const;

type BasicPreset =
  | {
      key: string;
      label: string;
      kind: "choices";
      source: "form" | "resume";
      config: ChoicesConfig;
    }
  | {
      key: string;
      label: string;
      kind: "dropdown";
      source: "form" | "resume";
      config: DropdownConfig;
    }
  | { key: string; label: string; kind: "range"; source: "form" | "resume"; config: RangeConfig };

export const BASIC_PRESETS: BasicPreset[] = [
  {
    key: "start",
    label: "入社できる時期",
    kind: "dropdown",
    source: "form",
    config: {
      options: [...START_TIMINGS],
      line: "3か月以内",
      dir: "upto",
      answerKey: "start_timing",
    },
  },
  {
    key: "pay",
    label: "希望年収",
    kind: "dropdown",
    source: "form",
    config: { options: [...PAY_BANDS], line: "500〜549万円", dir: "upto", answerKey: "pay_band" },
  },
  {
    key: "license",
    label: "普通自動車免許",
    kind: "choices",
    source: "resume",
    config: { options: ["あり", "なし"], pass: ["あり"] },
  },
  {
    key: "education",
    label: "最終学歴",
    kind: "dropdown",
    source: "resume",
    config: {
      options: ["中学卒業", "高校卒業", "専門・短大卒業", "大学卒業", "大学院修了"],
      line: "高校卒業",
      dir: "from",
    },
  },
  {
    key: "night",
    label: "夜勤",
    kind: "choices",
    source: "form",
    config: { options: ["できる", "できない", "相談したい"], pass: ["できる", "相談したい"] },
  },
  {
    key: "commute",
    label: "通勤時間",
    kind: "range",
    source: "form",
    config: { min: null, max: 60, unit: "分" },
  },
];

export const SPECIALIST_EXAMPLES = [
  "法人営業の経験",
  "新規開拓の営業経験",
  "チームリーダーの経験",
  "提案書づくりの経験",
  "日商簿記2級",
];
