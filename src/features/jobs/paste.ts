import { formatPay } from "./checks";
import type { PostingFields } from "./schema";

// Paste views (docs/02 M2-5): every value in the order of the board's own form, ready to copy.
// Labels mirror each board's form wording so users can find the matching input.

export type PasteRow = {
  label: string;
  value: string;
  /** Chosen from a list on the board. */ choose?: boolean;
};
export type PasteGroup = { title: string; rows: PasteRow[] };
export type PasteBoard = "indeed" | "engage" | "other";

const lines = (...parts: (string | number | false | null | undefined)[]) =>
  parts
    .filter((p) => p !== false && p !== null && p !== undefined && String(p).trim() !== "")
    .join("\n");

const description = (f: PostingFields) =>
  lines(f.description, f.dutyChange && `【業務の変更の範囲】${f.dutyChange}`);
const requirements = (f: PostingFields) =>
  lines(f.mustHave && `【必須】${f.mustHave}`, f.niceToHave && `【歓迎】${f.niceToHave}`);
const workplace = (f: PostingFields) =>
  lines(
    f.address,
    f.placeNote,
    f.workplaceChange && `【就業場所の変更の範囲】${f.workplaceChange}`,
    f.smoking && `【受動喫煙防止措置】${f.smoking}`,
  );
const holidays = (f: PostingFields) =>
  lines(f.annualHolidays && `年間休日 ${f.annualHolidays}`, f.holidays);
const payDetails = (f: PostingFields) =>
  lines(f.fixedOvertime && `固定残業代：${f.fixedOvertime}`, f.payNote);
const benefits = (f: PostingFields) =>
  lines(
    f.insurance?.length && `社会保険：${f.insurance.join("・")}`,
    f.probation && `試用期間：${f.probation}`,
    f.benefits,
  );
const amount = (f: PostingFields) =>
  f.payMin == null && f.payMax == null ? "" : `${f.payMin ?? ""}〜${f.payMax ?? ""}`;

export function pasteGroups(board: PasteBoard, f: PostingFields): PasteGroup[] {
  const v = (value: string | undefined | null) => value ?? "";
  if (board === "indeed") {
    return [
      {
        title: "基本情報",
        rows: [
          { label: "職種名", value: v(f.title) },
          { label: "雇用形態", value: v(f.employmentType), choose: true },
          { label: "勤務地住所", value: lines(f.postcode && `〒${f.postcode}`, f.address) },
        ],
      },
      {
        title: "給与・勤務条件",
        rows: [
          { label: "給与", value: formatPay(f), choose: true },
          { label: "固定残業代", value: v(f.fixedOvertime) },
          { label: "勤務形態", value: v(f.workSchedule), choose: true },
          { label: "1か月の平均所定労働時間", value: v(f.monthlyHours) },
          { label: "社会保険", value: (f.insurance ?? []).join("・"), choose: true },
          { label: "試用期間", value: v(f.probation) },
        ],
      },
      {
        title: "求人詳細",
        rows: [
          { label: "仕事内容", value: description(f) },
          { label: "アピールポイント", value: v(f.appeal) },
          { label: "求める人材", value: requirements(f) },
          { label: "勤務時間・曜日", value: v(f.hours) },
          { label: "休暇・休日", value: holidays(f) },
          { label: "勤務地", value: workplace(f) },
          { label: "アクセス", value: v(f.access) },
          { label: "給与の詳細", value: payDetails(f) },
          { label: "待遇・福利厚生", value: benefits(f) },
        ],
      },
    ];
  }
  if (board === "engage") {
    return [
      {
        title: "職種",
        rows: [
          { label: "職種カテゴリー", value: v(f.category), choose: true },
          { label: "職種名", value: v(f.title) },
          { label: "表示用職種名", value: v(f.displayTitle) },
        ],
      },
      { title: "会社情報", rows: [{ label: "事業内容", value: v(f.businessDescription) }] },
      {
        title: "勤務地",
        rows: [
          { label: "郵便番号", value: v(f.postcode) },
          { label: "住所", value: v(f.address) },
          { label: "アクセス", value: v(f.access) },
          {
            label: "備考",
            value: lines(
              f.placeNote,
              f.workplaceChange && `【就業場所の変更の範囲】${f.workplaceChange}`,
              f.smoking && `【受動喫煙防止措置】${f.smoking}`,
            ),
          },
        ],
      },
      {
        title: "求人区分・雇用形態",
        rows: [
          { label: "求人区分", value: v(f.jobClass), choose: true },
          { label: "雇用形態", value: v(f.employmentType), choose: true },
        ],
      },
      {
        title: "給与",
        rows: [
          { label: "給与タイプ", value: v(f.payType), choose: true },
          { label: "金額", value: amount(f) },
          { label: "備考", value: payDetails(f) },
        ],
      },
      {
        title: "勤務時間",
        rows: [
          { label: "勤務時間の形態", value: v(f.workSchedule), choose: true },
          { label: "備考", value: v(f.hours) },
        ],
      },
      { title: "仕事内容", rows: [{ label: "仕事内容", value: description(f) }] },
      {
        title: "応募資格・条件",
        rows: [
          { label: "最終学歴", value: v(f.education), choose: true },
          { label: "募集職種の経験", value: v(f.experienceRequired), choose: true },
          { label: "その他必要な経験・資格など", value: requirements(f) },
        ],
      },
      {
        title: "募集人数・募集背景",
        rows: [
          { label: "募集人数", value: v(f.headcount) },
          { label: "募集背景", value: v(f.hiringReason), choose: true },
        ],
      },
      { title: "休日休暇", rows: [{ label: "休日休暇", value: holidays(f) }] },
      {
        title: "待遇・福利厚生",
        rows: [
          { label: "加入保険", value: (f.insurance ?? []).join("・"), choose: true },
          {
            label: "待遇・福利厚生",
            value: lines(f.probation && `試用期間：${f.probation}`, f.benefits),
          },
        ],
      },
    ];
  }
  return [
    {
      title: "職種",
      rows: [
        { label: "職種名", value: v(f.title) },
        { label: "キャッチコピー・表示用タイトル", value: v(f.displayTitle) },
        { label: "職種カテゴリー", value: v(f.category), choose: true },
        { label: "雇用形態", value: v(f.employmentType), choose: true },
      ],
    },
    {
      title: "仕事内容",
      rows: [
        { label: "仕事内容", value: description(f) },
        { label: "アピールポイント・仕事の魅力", value: v(f.appeal) },
      ],
    },
    {
      title: "応募資格",
      rows: [
        { label: "応募資格・求める人材", value: requirements(f) },
        { label: "学歴", value: v(f.education), choose: true },
        { label: "経験", value: v(f.experienceRequired), choose: true },
      ],
    },
    {
      title: "勤務条件",
      rows: [
        { label: "給与", value: formatPay(f) },
        { label: "給与の詳細", value: payDetails(f) },
        { label: "勤務地", value: lines(f.postcode && `〒${f.postcode}`, workplace(f)) },
        { label: "アクセス", value: v(f.access) },
        {
          label: "勤務時間",
          value: lines(f.hours, f.monthlyHours && `1か月の平均所定労働時間：${f.monthlyHours}`),
        },
        { label: "休日・休暇", value: holidays(f) },
        { label: "待遇・福利厚生", value: benefits(f) },
      ],
    },
    {
      title: "会社・募集の情報",
      rows: [
        { label: "事業内容", value: v(f.businessDescription) },
        { label: "募集人数・募集背景", value: lines(f.headcount, f.hiringReason) },
      ],
    },
  ];
}
