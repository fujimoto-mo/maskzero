// Text helpers for screening, shared by the AI steps and the verdict code. Pure.

/** Comparable form: NFKC, unified dashes and long-vowel marks, whitespace removed. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‐‑‒–—―ー－−-]/g, "-")
    .replace(/\s+/g, "");
}

/** True when the quote appears verbatim (after normalization) in the document text (docs/05 §6.4). */
export function quoteIsInText(quote: string, text: string): boolean {
  const q = normalizeForMatch(quote);
  return q.length > 0 && normalizeForMatch(text).includes(q);
}

// Phrases that try to steer an AI reviewer. A second signal next to the model's own report; either
// one sends the application to a person.
const INJECTION =
  /(ignore|disregard|forget)\s+(all\s+|the\s+)?(previous|prior|above)|system\s*prompt|you\s+are\s+(an?\s+)?(ai|assistant|language model)|指示を無視|AI(へ|に)の指示|プロンプト|(合格|書類合格|採用)(に|と)(して|判定し)|(評価|点数|スコア)を(最高|満点|100)|この(応募者|候補者)を(合格|採用)/i;

export function looksLikeInjection(text: string): boolean {
  return INJECTION.test(text.normalize("NFKC"));
}

const EMAIL = /[^\s@<>()（）「」]+@[^\s@<>()（）「」]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+81[-\s]?\d{1,4}|0\d{1,4})[-\s(]?\d{1,4}[-\s)]?\d{3,4}/g;
const POSTCODE = /〒?\s?\d{3}-\d{4}/g;
const BIRTH_LINE = /^.*(生年月日|年\s*\d{1,2}\s*月\s*\d{1,2}\s*日\s*生).*$/gm;

/**
 * Blind screening (docs/05 §6.4): removes the candidate's name, contact details, postcode and
 * birth date from the text the screening model sees.
 */
export function maskForScreening(text: string, names: string[]): string {
  let masked = text.replace(BIRTH_LINE, "［生年月日］").replace(EMAIL, "［メール］");
  masked = masked.replace(PHONE, "［電話］").replace(POSTCODE, "［郵便番号］");
  for (const name of names) {
    for (const part of [name, ...name.split(/[\s　]+/)]) {
      if (part.trim().length >= 2) masked = masked.split(part.trim()).join("［氏名］");
    }
  }
  return masked;
}
