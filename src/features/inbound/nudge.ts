// The paste text for applicants who applied on a board but haven't entered (docs/02 M3-11, M9-7):
// sent through the board's own messaging. Pure.

export const DEFAULT_NUDGE = `{name}様

このたびは「{job}」にご応募いただき、ありがとうございます。
選考を進めるため、お手数ですが下記のページから応募の手続きをお願いいたします。3分ほどで完了します。

{URL}`;

/** Fills {name}, {job} and {URL}; the URL is required for the text to be of any use. */
export function renderNudge(
  template: string,
  values: { name: string; job: string; url: string },
): string {
  return template
    .replaceAll("{name}", values.name)
    .replaceAll("{job}", values.job)
    .replaceAll("{URL}", values.url);
}

export const nudgeIsValid = (template: string) =>
  template.includes("{URL}") && template.trim().length <= 1000;
