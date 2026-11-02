// The auto-reply text sent through each job board's messaging (docs/02 M3-2): one template per
// company with a required {URL} and an optional {JOB}, filled in per job × board.

export const ENTRY_TEMPLATE_MAX = 2000;

export const DEFAULT_ENTRY_TEMPLATE = `このたびは「{JOB}」にご応募いただき、ありがとうございます。
選考を進めるため、下記のページから履歴書の提出と簡単な質問へのご回答をお願いいたします（3分ほどで終わります）。
{URL}
ご不明な点がありましたら、このメッセージにご返信ください。`;

export type TemplateProblem = "missingUrl" | "tooLong";

export function checkEntryTemplate(template: string): TemplateProblem | null {
  if (!template.includes("{URL}")) return "missingUrl";
  if (template.length > ENTRY_TEMPLATE_MAX) return "tooLong";
  return null;
}

export function renderEntryMessage(
  template: string,
  values: { url: string; jobTitle: string },
): string {
  return template.replaceAll("{URL}", values.url).replaceAll("{JOB}", values.jobTitle);
}
