// Job posting form definition: a superset of the Indeed and engage input forms (docs/01 §5.4,
// docs/02 M2-2). Labels and options mirror Japanese job-board vocabulary, and option values are
// stored as-is, so they live here rather than in the translated messages.

export type Board = "indeed" | "engage";

type FieldBase = {
  key: PostingFieldKey;
  label: string;
  required?: boolean;
  /** Only these boards use the field; omitted = every board. */
  boards?: Board[];
  hint?: string;
  placeholder?: string;
  /** Board-specific length limit, checked as a warning. */
  maxLength?: { board: Board; chars: number };
  narrow?: boolean;
};

export type FieldDef =
  | (FieldBase & { type: "text" })
  | (FieldBase & { type: "textarea"; rows?: number })
  | (FieldBase & { type: "select"; options: readonly string[] })
  | (FieldBase & { type: "checks"; options: readonly string[] })
  | (FieldBase & { type: "pay" });

export type SectionId = "basic" | "place" | "pay" | "time" | "job" | "req" | "benefit" | "recruit";

export type SectionDef = { id: SectionId; title: string; fields: FieldDef[] };

export const EMPLOYMENT_TYPES = [
  "正社員",
  "契約社員",
  "パート・アルバイト",
  "派遣社員",
  "業務委託",
] as const;
export const PAY_TYPES = ["月給", "年俸", "日給", "時給"] as const;
export const INSURANCES = ["雇用保険", "労災保険", "健康保険", "厚生年金"] as const;

export const SECTIONS: SectionDef[] = [
  {
    id: "basic",
    title: "基本情報",
    fields: [
      {
        key: "title",
        label: "職種名",
        type: "text",
        required: true,
        placeholder: "例：法人営業",
        hint: "雇用形態・会社名・給与・「未経験歓迎」などの言葉や記号は入れません（各媒体の掲載ルール）",
      },
      {
        key: "displayTitle",
        label: "表示用の求人タイトル",
        type: "text",
        boards: ["engage"],
        placeholder: "例：法人向けルート営業／土日祝休み",
        hint: "一覧で目に留まる一言を添えます。詰め込みすぎると掲載が制限されることがあります",
      },
      {
        key: "category",
        label: "職種カテゴリー",
        type: "select",
        required: true,
        options: [
          "営業",
          "事務・アシスタント",
          "販売・接客",
          "ドライバー・配送",
          "製造・軽作業",
          "ITエンジニア",
          "介護・福祉",
          "医療",
          "飲食",
          "建築・土木",
          "その他",
        ],
      },
      {
        key: "employmentType",
        label: "雇用形態",
        type: "select",
        required: true,
        options: EMPLOYMENT_TYPES,
      },
      {
        key: "jobClass",
        label: "求人区分",
        type: "select",
        boards: ["engage"],
        options: ["フルタイム", "パートタイム", "その他"],
      },
    ],
  },
  {
    id: "place",
    title: "勤務地・アクセス",
    fields: [
      {
        key: "postcode",
        label: "郵便番号",
        type: "text",
        required: true,
        narrow: true,
        placeholder: "100-0001",
      },
      { key: "address", label: "勤務地の住所", type: "text", required: true },
      {
        key: "access",
        label: "アクセス",
        type: "text",
        placeholder: "例：〇〇駅から徒歩5分／車通勤可",
        hint: "最寄り駅からの時間と、車・バイク通勤ができるか",
      },
      {
        key: "workplaceChange",
        label: "就業場所の変更の範囲",
        type: "text",
        required: true,
        placeholder: "例：会社の定める事業所／変更なし",
        hint: "2024年4月から、求人に書くことが必要です",
      },
      {
        key: "placeNote",
        label: "勤務地の補足",
        type: "textarea",
        rows: 2,
        hint: "在宅勤務の有無、出張・転勤など",
      },
      {
        key: "smoking",
        label: "受動喫煙防止措置",
        type: "select",
        required: true,
        options: ["屋内禁煙", "屋内原則禁煙（喫煙専用室あり）", "敷地内禁煙", "対策なし"],
        hint: "求人に書くことが必要です",
      },
    ],
  },
  {
    id: "pay",
    title: "給与",
    fields: [
      { key: "payType", label: "給与の種類", type: "select", required: true, options: PAY_TYPES },
      {
        key: "pay",
        label: "金額",
        type: "pay",
        required: true,
        hint: "最低賃金以上。人によって変わる手当は含めません",
      },
      {
        key: "fixedOvertime",
        label: "固定残業代",
        type: "text",
        placeholder: "例：なし（残業代は全額支給）",
        hint: "ある場合は、何時間分でいくらか、超えた分は別に支払うことを書きます",
      },
      {
        key: "payNote",
        label: "給与の補足",
        type: "textarea",
        rows: 3,
        hint: "昇給・賞与・手当・交通費・想定年収など",
      },
    ],
  },
  {
    id: "time",
    title: "勤務時間・休日",
    fields: [
      {
        key: "workSchedule",
        label: "勤務時間の形態",
        type: "select",
        options: ["固定時間制", "シフト制", "変形労働時間制", "フレックスタイム制", "裁量労働制"],
      },
      {
        key: "hours",
        label: "勤務時間",
        type: "text",
        required: true,
        placeholder: "例：9:00〜18:00（休憩60分）／残業 月平均10時間",
      },
      {
        key: "monthlyHours",
        label: "1か月の平均所定労働時間",
        type: "text",
        boards: ["indeed"],
        narrow: true,
        placeholder: "160時間",
      },
      {
        key: "annualHolidays",
        label: "年間休日",
        type: "text",
        narrow: true,
        placeholder: "120日",
      },
      { key: "holidays", label: "休日・休暇", type: "textarea", rows: 2, required: true },
    ],
  },
  {
    id: "job",
    title: "仕事内容",
    fields: [
      {
        key: "description",
        label: "仕事内容",
        type: "textarea",
        rows: 6,
        required: true,
        maxLength: { board: "engage", chars: 750 },
        hint: "扱うもの・進め方・任せる範囲・入社後の流れを具体的に",
      },
      {
        key: "dutyChange",
        label: "業務の変更の範囲",
        type: "text",
        required: true,
        placeholder: "例：会社の定める業務／変更なし",
        hint: "2024年4月から、求人に書くことが必要です",
      },
      { key: "appeal", label: "アピールポイント", type: "textarea", rows: 3, boards: ["indeed"] },
    ],
  },
  {
    id: "req",
    title: "応募資格",
    fields: [
      {
        key: "experienceRequired",
        label: "募集職種の経験",
        type: "select",
        boards: ["engage"],
        options: ["不問", "経験者のみ"],
      },
      {
        key: "education",
        label: "最終学歴",
        type: "select",
        boards: ["engage"],
        options: ["不問", "高校卒業以上", "専門・短大卒業以上", "大学卒業以上"],
      },
      {
        key: "mustHave",
        label: "必須の経験・資格",
        type: "textarea",
        rows: 3,
        required: true,
        hint: "年齢・性別・国籍で応募を制限する書き方はできません",
      },
      { key: "niceToHave", label: "歓迎する経験・資格", type: "textarea", rows: 3 },
    ],
  },
  {
    id: "benefit",
    title: "待遇・福利厚生",
    fields: [
      { key: "insurance", label: "加入保険", type: "checks", required: true, options: INSURANCES },
      {
        key: "probation",
        label: "試用期間",
        type: "text",
        placeholder: "例：3か月（条件の変更なし）",
      },
      { key: "benefits", label: "待遇・福利厚生", type: "textarea", rows: 3 },
    ],
  },
  {
    id: "recruit",
    title: "募集・会社情報",
    fields: [
      {
        key: "headcount",
        label: "採用予定人数",
        type: "text",
        narrow: true,
        placeholder: "例：2名",
      },
      {
        key: "hiringReason",
        label: "募集の背景",
        type: "select",
        boards: ["engage"],
        options: ["増員", "欠員補充", "新規事業"],
      },
      {
        key: "businessDescription",
        label: "事業内容",
        type: "textarea",
        rows: 3,
        boards: ["engage"],
        maxLength: { board: "engage", chars: 400 },
      },
    ],
  },
];

export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields);

/** Unit for the pay amounts: 万円 for monthly and yearly pay, 円 for daily and hourly. */
export function payUnit(payType: string | undefined): "万円" | "円" {
  return payType === "日給" || payType === "時給" ? "円" : "万円";
}

export type PostingFieldKey =
  | "title"
  | "displayTitle"
  | "category"
  | "employmentType"
  | "jobClass"
  | "postcode"
  | "address"
  | "access"
  | "workplaceChange"
  | "placeNote"
  | "smoking"
  | "payType"
  | "pay"
  | "fixedOvertime"
  | "payNote"
  | "workSchedule"
  | "hours"
  | "monthlyHours"
  | "annualHolidays"
  | "holidays"
  | "description"
  | "dutyChange"
  | "appeal"
  | "experienceRequired"
  | "education"
  | "mustHave"
  | "niceToHave"
  | "insurance"
  | "probation"
  | "benefits"
  | "headcount"
  | "hiringReason"
  | "businessDescription";
