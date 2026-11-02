import { PAY_BANDS, STANDARD_ANSWER_KEYS, START_TIMINGS } from "@/features/screening/presets";
import type { PostingFields } from "./schema";

// The sample job every new company starts with (docs/02 M1-2): fully written so the editor, the
// paste views and the checks can be explored, but without images, so the checks panel shows how a
// missing main image is reported. Fictional content.

export const SAMPLE_JOB_FIELDS: PostingFields = {
  title: "法人営業（ルート営業）",
  displayTitle: "既存のお客様中心の法人営業／土日祝休み",
  category: "営業",
  employmentType: "正社員",
  jobClass: "フルタイム",
  postcode: "100-0005",
  address: "東京都千代田区丸の内1-1-1",
  access: "東京駅から徒歩5分",
  workplaceChange: "会社の定める事業所",
  placeNote: "転勤なし。営業先へは公共交通機関で移動します。",
  smoking: "屋内禁煙",
  payType: "月給",
  payMin: 28,
  payMax: 40,
  fixedOvertime: "なし（残業代は全額支給）",
  payNote: "昇給年1回／賞与年2回／交通費全額支給",
  workSchedule: "固定時間制",
  hours: "9:00〜18:00（休憩60分）／残業 月平均10時間",
  monthlyHours: "160時間",
  annualHolidays: "125日",
  holidays: "土日祝休み、夏季休暇、年末年始休暇、有給休暇",
  description:
    "オフィス用品を使っている既存のお客様を訪問し、追加のご提案や使い方のご相談に対応します。担当は約40社で、新規の飛び込み営業はありません。入社後1か月は先輩に同行し、商品知識と提案の進め方を覚えていただきます。",
  dutyChange: "会社の定める業務",
  appeal: "既存のお客様が中心なので、じっくり関係を築けます。",
  experienceRequired: "不問",
  education: "高校卒業以上",
  mustHave: "法人・個人を問わず、営業または接客の経験（1年以上）",
  niceToHave: "普通自動車免許、提案書づくりの経験",
  insurance: ["雇用保険", "労災保険", "健康保険", "厚生年金"],
  probation: "3か月（条件の変更なし）",
  benefits: "資格取得の支援、在宅勤務（週1日まで）",
  headcount: "2名",
  hiringReason: "増員",
  businessDescription: "オフィス用品と業務システムの販売、導入のサポート",
};

/** Screening conditions the sample job starts with: two entry-form questions and one from the résumé. */
export const SAMPLE_CRITERIA = [
  {
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
  },
  {
    type: "basic",
    label: "希望年収",
    kind: "dropdown",
    source: "form",
    config: {
      options: [...PAY_BANDS],
      line: "500〜549万円",
      dir: "upto",
      answerKey: STANDARD_ANSWER_KEYS.payBand,
    },
  },
  { type: "specialist", label: "法人営業または接客の経験", kind: null, source: null, config: {} },
] as const;
