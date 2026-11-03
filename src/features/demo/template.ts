import { SAMPLE_JOB_FIELDS } from "@/features/jobs/sample";
import type { PostingFields } from "@/features/jobs/schema";
import type { AiCriterionResult, Criterion, Verdict } from "@/features/screening/domain";
import { START_TIMINGS, STANDARD_ANSWER_KEYS } from "@/features/screening/presets";
import people from "./files/people.json";

// The /demo sandbox (docs/02 M0-4): an invented agency with two clients, a job each, and
// applicants at every step. Everything here is synthetic. The applicants with documents come from
// files/, made by `pnpm demo:files` from the AI eval generator; their criteria keys match it.

export const DEMO_ORG_NAME = "みらい人材サービス（デモ）";
/** Members' addresses end here (RFC 2606): mail to them can never be delivered. */
export const DEMO_EMAIL_DOMAIN = "demo.mask0.invalid";
export const DEMO_HOURS = 24;

/** A condition before it has a row id; weights are equal. */
export type DemoCriterion = (Criterion extends infer C
  ? C extends Criterion
    ? Omit<C, "id" | "weight">
    : never
  : never) & {
  key: string;
};
type DemoJob = {
  client: "main" | "hidamari";
  fields: PostingFields;
  criteria: DemoCriterion[];
  channels: string[];
};

export const DEMO_CLIENTS = [
  { slug: "main", name: "みなと精機株式会社", isDefault: true },
  { slug: "hidamari", name: "社会福祉法人ひだまり会", isDefault: false },
] as const;

const startTiming = (key: string): DemoCriterion => ({
  key,
  type: "basic",
  label: "入社できる時期",
  kind: "dropdown",
  source: "form",
  config: {
    options: [...START_TIMINGS],
    line: "3か月以内",
    dir: "upto",
    answerKey: STANDARD_ANSWER_KEYS.startTiming,
  },
  required: false,
});

export const DEMO_JOBS: Record<"sales" | "care", DemoJob> = {
  sales: {
    client: "main",
    channels: ["Indeed", "doda", "自社サイト"],
    fields: {
      ...SAMPLE_JOB_FIELDS,
      title: "法人営業（オフィス機器）",
      displayTitle: "中小企業のお客様に複合機と業務ソフトを提案／土日祝休み",
      postcode: "100-0000",
      address: "東京都架空区みなと町1-2-3",
      access: "みなと町駅から徒歩5分",
      mustHave: "法人営業の経験、普通自動車免許",
    },
    criteria: [
      {
        key: "s_licence",
        type: "basic",
        label: "普通自動車第一種運転免許",
        kind: "choices",
        source: "resume",
        config: { options: ["あり", "なし"], pass: ["あり"] },
        required: true,
      },
      {
        key: "s_years",
        type: "basic",
        label: "営業職の経験年数",
        kind: "range",
        source: "resume",
        config: { min: 3, unit: "年" },
        required: false,
      },
      { key: "s_b2b", type: "specialist", label: "法人営業の経験", required: true },
      {
        key: "s_lead",
        type: "specialist",
        label: "チームリーダーなど、メンバーをまとめた経験",
        required: false,
      },
      startTiming("s_start"),
    ],
  },
  care: {
    client: "hidamari",
    channels: ["Indeed", "ハローワーク"],
    fields: {
      ...SAMPLE_JOB_FIELDS,
      title: "介護職員（特別養護老人ホーム）",
      displayTitle: "定員80名の特養で介護職員を募集／夜勤は月4回程度",
      category: "介護・福祉",
      postcode: "220-0000",
      address: "神奈川県横浜市架空区そよ風台2-3-4",
      access: "そよ風台駅からバス10分",
      placeNote: "マイカー通勤できます。",
      payMin: 23,
      payMax: 30,
      payNote: "夜勤手当1回6,000円／資格手当あり／賞与年2回",
      workSchedule: "シフト制",
      hours: "早番 7:00〜16:00／日勤 9:00〜18:00／遅番 11:00〜20:00／夜勤 16:30〜翌9:30",
      holidays: "4週8休（シフト制）、夏季休暇、年末年始休暇、有給休暇",
      description:
        "特別養護老人ホームで、ご利用者様の食事・入浴・排せつの介助や、レクリエーションの準備をお願いします。ユニットごとに10名ほどのご利用者様を、チームで担当します。",
      appeal: "資格取得の費用を法人が負担します。",
      mustHave: "介護職員初任者研修以上の資格",
      niceToHave: "夜勤の経験、認知症ケアの経験",
    },
    criteria: [
      {
        key: "c_cert",
        type: "basic",
        label: "介護の資格",
        kind: "choices",
        source: "resume",
        config: {
          options: ["介護福祉士", "実務者研修", "初任者研修", "なし"],
          pass: ["介護福祉士", "実務者研修", "初任者研修"],
        },
        required: true,
      },
      {
        key: "c_years",
        type: "basic",
        label: "介護の実務経験",
        kind: "range",
        source: "resume",
        config: { min: 1, unit: "年" },
        required: false,
      },
      { key: "c_night", type: "specialist", label: "夜勤の経験", required: false },
      { key: "c_dementia", type: "specialist", label: "認知症の方へのケアの経験", required: false },
      startTiming("c_start"),
    ],
  },
};

export type DemoPerson = {
  key: string;
  job: "sales" | "care";
  verdict: Verdict;
  name: string;
  kana: string;
  email: string;
  phone: string;
  prefecture: string;
  city: string;
  answers: Record<string, string>;
  files: { kind: "resume" | "cv"; file: string }[];
  ai: AiCriterionResult[];
};

/** Applicants with documents, already read and screened. */
export const DEMO_PEOPLE = people as DemoPerson[];

/** Where each screened applicant is now: passes move on to booking, one per job is booked. */
export type DemoStep = "booked" | "invited" | "screened";

/** Hours since each applicant applied, newest first. */
export const APPLIED_HOURS_AGO = [2, 20, 50, 74, 120, 150, 210, 280];

/** Past applicants without documents, so the dashboard and analytics have history. */
export const DEMO_HISTORY: {
  name: string;
  job: "sales" | "care";
  daysAgo: number;
  end: "screened_out" | "withdrew" | "interview_rejected" | "hired";
}[] = [
  { name: "春野 一輝", job: "sales", daysAgo: 16, end: "screened_out" },
  { name: "秋月 沙耶", job: "care", daysAgo: 18, end: "withdrew" },
  { name: "冬木 陸", job: "sales", daysAgo: 21, end: "interview_rejected" },
  { name: "夏川 葵", job: "care", daysAgo: 24, end: "hired" },
  { name: "桜庭 樹", job: "sales", daysAgo: 27, end: "screened_out" },
  { name: "楓 実里", job: "care", daysAgo: 31, end: "interview_rejected" },
  { name: "椿 優斗", job: "sales", daysAgo: 36, end: "hired" },
  { name: "柊 花音", job: "care", daysAgo: 40, end: "screened_out" },
  { name: "梢 蓮", job: "sales", daysAgo: 45, end: "withdrew" },
  { name: "若葉 凛", job: "care", daysAgo: 52, end: "interview_rejected" },
  { name: "雪村 晴", job: "sales", daysAgo: 58, end: "screened_out" },
  { name: "霞 紬", job: "care", daysAgo: 66, end: "hired" },
];
