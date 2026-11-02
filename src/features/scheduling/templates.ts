// Candidate emails (docs/02 M9-1, M9-3): triggers, merge fields, shipped Japanese defaults,
// rendering and validation. Pure.

export const TRIGGERS = [
  "pass",
  "follow_up",
  "confirmed",
  "reminder",
  "rejection",
  "next_round",
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const MERGE_FIELDS = [
  "name",
  "company",
  "job",
  "booking_url",
  "portal_url",
  "interview_at",
  "tool",
  "meeting_url",
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type MergeValues = Partial<Record<MergeField, string>>;

/** Fields a template must contain to do its job. */
export const REQUIRED_FIELDS: Record<Trigger, MergeField[]> = {
  pass: ["booking_url"],
  follow_up: ["booking_url"],
  next_round: ["booking_url"],
  confirmed: ["interview_at"],
  reminder: ["interview_at"],
  rejection: [],
};

export type Template = { subject: string; body: string };

const SIGNATURE =
  "\n\n――――――――――――\n{company} 採用担当\n※このメールは送信専用のアドレスから送っています。お問い合わせは、このメールへの返信でお送りください。";

export const DEFAULT_TEMPLATES: Record<Trigger, Template> = {
  pass: {
    subject: "【{company}】書類選考の結果と面接日程のご案内",
    body: `{name} 様

このたびは「{job}」にご応募いただき、ありがとうございます。
{company} 採用担当です。

書類選考の結果、ぜひ面接にお進みいただきたく、ご連絡いたしました。
下記のページから、ご都合のよい日時を3つまでお選びください。

{booking_url}

どうぞよろしくお願いいたします。${SIGNATURE}`,
  },
  follow_up: {
    subject: "【{company}】面接日程のご回答のお願い",
    body: `{name} 様

{company} 採用担当です。
先日ご案内した「{job}」の面接日程について、まだご回答をいただいていないため、改めてご連絡いたしました。
下記のページから、ご都合のよい日時をお選びください。

{booking_url}

すでにご対応いただいている場合は、行き違いとなり失礼いたしました。${SIGNATURE}`,
  },
  confirmed: {
    subject: "【{company}】面接日時が確定しました",
    body: `{name} 様

{company} 採用担当です。
「{job}」の面接日時が確定しましたので、お知らせいたします。

日時：{interview_at}
方法：{tool}
{meeting_url}

日程の変更やキャンセルは、下記のページから行えます。
{portal_url}

当日はどうぞよろしくお願いいたします。${SIGNATURE}`,
  },
  reminder: {
    subject: "【{company}】明日の面接のご案内",
    body: `{name} 様

{company} 採用担当です。
明日の面接について、改めてお知らせいたします。

日時：{interview_at}
方法：{tool}
{meeting_url}

ご都合が悪くなった場合は、下記のページからご連絡ください。
{portal_url}

お会いできることを楽しみにしております。${SIGNATURE}`,
  },
  rejection: {
    subject: "【{company}】選考結果のご連絡",
    body: `{name} 様

このたびは「{job}」にご応募いただき、誠にありがとうございました。
{company} 採用担当です。

慎重に選考を進めました結果、誠に残念ながら、今回はご希望に添いかねる結果となりました。
ご期待に添えず申し訳ございません。

末筆ながら、{name} 様の今後のご活躍をお祈り申し上げます。${SIGNATURE}`,
  },
  next_round: {
    subject: "【{company}】次の面接のご案内",
    body: `{name} 様

先日は面接のお時間をいただき、ありがとうございました。
{company} 採用担当です。

次の面接にお進みいただきたく、ご連絡いたしました。
下記のページから、ご都合のよい日時を3つまでお選びください。

{booking_url}

どうぞよろしくお願いいたします。${SIGNATURE}`,
  },
};

const FIELD = /\{([a-z_]+)\}/g;

/** Replaces {field}s; unknown or missing values become empty, so nothing like "{x}" reaches people. */
export function render(text: string, values: MergeValues): string {
  return text.replace(FIELD, (_, field: string) => values[field as MergeField] ?? "");
}

export function renderTemplate(template: Template, values: MergeValues): Template {
  return {
    // Subjects are one line.
    subject: render(template.subject, values).replace(/\s+/g, " ").trim(),
    body: render(template.body, values)
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

export type TemplateProblem =
  | { code: "unknownField"; field: string }
  | { code: "missingField"; field: MergeField }
  | { code: "empty" };

/** Unknown {fields}, fields the trigger needs, and blank subjects or bodies (M9-3). */
export function validateTemplate(trigger: Trigger, template: Template): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  if (!template.subject.trim() || !template.body.trim()) problems.push({ code: "empty" });
  const used = new Set(
    [...`${template.subject}\n${template.body}`.matchAll(FIELD)].map((m) => m[1]!),
  );
  for (const field of used) {
    if (!(MERGE_FIELDS as readonly string[]).includes(field))
      problems.push({ code: "unknownField", field });
  }
  for (const field of REQUIRED_FIELDS[trigger]) {
    if (!used.has(field)) problems.push({ code: "missingField", field });
  }
  return problems;
}
