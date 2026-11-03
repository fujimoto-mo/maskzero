// Candidate emails (docs/02 M9-1 – M9-3): triggers, timing, merge fields, shipped Japanese
// defaults, rendering and validation. Pure.

export const TRIGGERS = [
  "pass",
  "follow_up",
  "next_round",
  "confirmed",
  "remind_5d",
  "remind_3d",
  "reminder",
  "interview_day",
  "thanks",
  "no_show",
  "rejection",
  "cv_missing",
  "pool_suggestion",
  "ai_invite",
  "ai_remind",
] as const;
export type Trigger = (typeof TRIGGERS)[number];
/** What the send log can show: a trigger above, or one of the company's custom emails. */
export type LoggedTrigger = Trigger | "custom";

export const TIMINGS = [
  "immediately",
  "same_day_18",
  "day_before_18",
  "next_day_10",
  "plus_3d_10",
  "plus_1w_10",
] as const;
export type Timing = (typeof TIMINGS)[number];

/**
 * Triggers whose send time the company chooses (M9-3), with the default. The others go out at
 * fixed points: on the event, or relative to the interview (5 and 3 days before at 10:00, the day
 * before at 18:00, the day itself at 08:00).
 */
export const DEFAULT_TIMING: Partial<Record<Trigger, Timing>> = {
  thanks: "same_day_18",
  no_show: "immediately",
  rejection: "next_day_10",
  cv_missing: "next_day_10",
};

/** Timings that make sense without an interview to count back from. */
export const EVENT_TIMINGS: Timing[] = [
  "immediately",
  "same_day_18",
  "next_day_10",
  "plus_3d_10",
  "plus_1w_10",
];

export const ANCHORS = [
  "applied",
  "passed",
  "interview_scheduled",
  "interview_done",
  "no_show",
  "rejected",
] as const;
export type Anchor = (typeof ANCHORS)[number];

/** Custom emails can count back from the interview only when they follow its booking. */
export const timingsFor = (anchor: Anchor): Timing[] =>
  anchor === "interview_scheduled" ? [...EVENT_TIMINGS, "day_before_18"] : EVENT_TIMINGS;

export const MERGE_FIELDS = [
  "name",
  "company",
  "job",
  "booking_url",
  "portal_url",
  "upload_url",
  "consent_url",
  "interview_at",
  "tool",
  "meeting_url",
  "concerns",
  "entry_url",
  "recording_notice",
  "interview_url",
  "deadline",
] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type MergeValues = Partial<Record<MergeField, string>>;

/** Fields a template must contain to do its job. */
export const REQUIRED_FIELDS: Record<Trigger, MergeField[]> = {
  pass: ["booking_url"],
  follow_up: ["booking_url"],
  next_round: ["booking_url"],
  confirmed: ["interview_at"],
  remind_5d: ["interview_at"],
  remind_3d: ["interview_at"],
  reminder: ["interview_at"],
  interview_day: ["interview_at"],
  thanks: [],
  no_show: ["booking_url"],
  rejection: [],
  cv_missing: ["upload_url"],
  pool_suggestion: ["entry_url", "consent_url"],
  ai_invite: ["interview_url", "deadline"],
  ai_remind: ["interview_url", "deadline"],
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

{recording_notice}

当日はどうぞよろしくお願いいたします。${SIGNATURE}`,
  },
  remind_5d: {
    subject: "【{company}】面接まであと5日となりました",
    body: `{name} 様

{company} 採用担当です。
「{job}」の面接まで、あと5日となりました。

日時：{interview_at}
方法：{tool}

{concerns}

ご不明な点があれば、このメールへの返信でお気軽にお尋ねください。${SIGNATURE}`,
  },
  remind_3d: {
    subject: "【{company}】面接の3日前のご案内",
    body: `{name} 様

{company} 採用担当です。
面接まで3日となりましたので、当日の流れをご案内します。

日時：{interview_at}
方法：{tool}
{meeting_url}

{concerns}

日程の変更が必要な場合は、下記のページから行えます。
{portal_url}${SIGNATURE}`,
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
  interview_day: {
    subject: "【{company}】本日の面接のご案内",
    body: `{name} 様

おはようございます。{company} 採用担当です。
本日の面接の詳細をお送りします。

日時：{interview_at}
方法：{tool}
{meeting_url}

お時間になりましたら、上記からご参加ください。どうぞよろしくお願いいたします。${SIGNATURE}`,
  },
  thanks: {
    subject: "【{company}】面接のお礼",
    body: `{name} 様

{company} 採用担当です。
本日は「{job}」の面接にお時間をいただき、誠にありがとうございました。

選考の結果は、あらためてご連絡いたします。
今しばらくお待ちくださいますよう、お願いいたします。${SIGNATURE}`,
  },
  no_show: {
    subject: "【{company}】面接日程の再調整のお願い",
    body: `{name} 様

{company} 採用担当です。
本日予定していた面接について、ご参加が確認できませんでした。
ご都合がつかなかった場合は、下記のページから改めて日時をお選びください。

{booking_url}

すでにご連絡をいただいている場合は、行き違いとなり失礼いたしました。${SIGNATURE}`,
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
  cv_missing: {
    subject: "【{company}】職務経歴書のご提出のお願い",
    body: `{name} 様

{company} 採用担当です。
「{job}」へのご応募、ありがとうございます。

選考を進めるにあたり、職務経歴書のご提出をお願いしております。
お手数ですが、下記のページからアップロードしてください。

{upload_url}

すでにご提出いただいている場合は、行き違いとなり失礼いたしました。${SIGNATURE}`,
  },
  pool_suggestion: {
    subject: "【{company}】ご紹介したい求人があります",
    body: `{name} 様

以前ご応募いただいた際に、ほかの求人のご案内を希望されていたため、ご連絡いたしました。
{company}の「{job}」の求人をご紹介します。

ご興味があれば、下記のページからご応募ください。
{entry_url}

今後このようなご案内が不要な場合は、下記のページから停止できます。
{consent_url}${SIGNATURE}`,
  },
  ai_invite: {
    subject: "【{company}】書類選考の結果とAI面接のご案内",
    body: `{name} 様

このたびは「{job}」にご応募いただき、ありがとうございます。
{company} 採用担当です。

書類選考の結果、次の選考に進んでいただきたく、ご連絡いたしました。
最初の面接は、AIの面接官とのチャット形式で行います。ご都合のよいときに、下記のページからお受けください。

{interview_url}

回答期限：{deadline}

AIの評価だけで合否が決まることはありません。回答は採用担当者が確認します。
人の面接官との面接をご希望の場合も、上記のページからお選びいただけます。${SIGNATURE}`,
  },
  ai_remind: {
    subject: "【{company}】AI面接の回答期限が近づいています",
    body: `{name} 様

{company} 採用担当です。
「{job}」のAI面接の回答期限が近づいていますので、ご案内いたします。

{interview_url}

回答期限：{deadline}

すでにお受けいただいている場合は、行き違いとなり失礼いたしました。${SIGNATURE}`,
  },
};

/** A starting point for a new custom email. */
export const CUSTOM_TEMPLATE: Template = {
  subject: "【{company}】",
  body: `{name} 様

{company} 採用担当です。
${SIGNATURE}`,
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

/** The {concerns} block: the candidate's selected concerns with the company's answers. */
export function renderConcerns(concerns: { label: string; answer: string }[]): string {
  if (concerns.length === 0) return "";
  return [
    "ご予約の際にお選びいただいた点について、ご案内します。",
    ...concerns.map((c) => `■${c.label}\n${c.answer}`),
  ].join("\n\n");
}

export type TemplateProblem =
  | { code: "unknownField"; field: string }
  | { code: "missingField"; field: MergeField }
  | { code: "empty" };

/**
 * Unknown {fields}, fields the trigger needs, and blank subjects or bodies (M9-3). Custom emails
 * pass `null`: they only need to be non-empty and use known fields.
 */
export function validateTemplate(trigger: Trigger | null, template: Template): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  if (!template.subject.trim() || !template.body.trim()) problems.push({ code: "empty" });
  const used = new Set(
    [...`${template.subject}\n${template.body}`.matchAll(FIELD)].map((m) => m[1]!),
  );
  for (const field of used) {
    if (!(MERGE_FIELDS as readonly string[]).includes(field))
      problems.push({ code: "unknownField", field });
  }
  for (const field of trigger ? REQUIRED_FIELDS[trigger] : []) {
    if (!used.has(field)) problems.push({ code: "missingField", field });
  }
  return problems;
}
