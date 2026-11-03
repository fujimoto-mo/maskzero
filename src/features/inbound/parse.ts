import { KNOWN_CHANNELS } from "@/features/intake/channels";

// Job-board notification emails (docs/02 M3-10), pure. Boards are recognised by the sender's
// domain (also inside a forwarded message) or their name in the subject. The applicant's name
// and the job come from common phrasings and the company's own job titles. Real notifications
// vary by board and change over time: anything not understood is kept for staff to look at.

/** Sender domains of the boards in features/intake/channels.ts; extend from real samples. */
const BOARD_DOMAINS: [domain: string, channel: string][] = [
  ["indeed.com", "Indeed"],
  ["indeedemail.com", "Indeed"],
  ["kyujinbox.com", "求人ボックス"],
  ["stanby.com", "スタンバイ"],
  ["en-gage.net", "engage"],
  ["doda.jp", "doda"],
  ["tenshoku.mynavi.jp", "マイナビ転職"],
  ["baito.mynavi.jp", "マイナビバイト"],
  ["rikunabi.com", "リクナビNEXT"],
  ["en-japan.com", "エン転職"],
  ["type.jp", "type"],
  ["bizreach.jp", "ビズリーチ"],
  ["green-japan.com", "Green"],
  ["wantedly.com", "Wantedly"],
  ["baitoru.com", "バイトル"],
  ["townwork.net", "タウンワーク"],
  ["e-aidem.com", "イーアイデム"],
  ["jmty.jp", "ジモティー"],
];

const ADDRESS = /[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g;
/** "From:" lines of a forwarded message, in English or Japanese mail clients. */
const FORWARDED_FROM = /^(?:>?\s*)(?:From|差出人|送信者|送信元)\s*[:：].*$/gim;

export const normalizeAddress = (address: string) => address.trim().toLowerCase();

function boardOfDomain(domain: string): string | null {
  const d = domain.toLowerCase();
  return BOARD_DOMAINS.find(([known]) => d === known || d.endsWith(`.${known}`))?.[1] ?? null;
}

/** The board a notification came from: the sender, a forwarded sender, or its name in the subject. */
export function detectBoard(input: { from: string; subject: string; text: string }): string | null {
  for (const match of input.from.matchAll(ADDRESS)) {
    const board = boardOfDomain(match[1]!);
    if (board) return board;
  }
  for (const line of input.text.match(FORWARDED_FROM) ?? []) {
    for (const match of line.matchAll(ADDRESS)) {
      const board = boardOfDomain(match[1]!);
      if (board) return board;
    }
  }
  const subject = input.subject.normalize("NFKC").toLowerCase();
  return KNOWN_CHANNELS.find((c) => subject.includes(c.toLowerCase())) ?? null;
}

const NAME_PATTERNS = [
  // 応募者：山田 太郎 / 氏名: 山田太郎様
  /(?:応募者(?:名)?|氏名|お名前)\s*[:：]\s*([^\n\r]{1,40}?)\s*(?:さん|様)?\s*$/m,
  // 山田 太郎さんから応募がありました / 山田太郎様より新しい応募
  /(?:^|[\s　「【：:、。）)])([^\s　「」【】（）()、。:：!！?？]{1,15}(?:[ 　][^\s　「」【】（）()、。:：!！?？]{1,15})?)\s*(?:さん|様)(?:から|より)[^\n]{0,30}応募/m,
  // 【新着応募】山田 太郎さん
  /【[^】]*応募[^】]*】\s*([^\s　]{1,15}(?:[ 　][^\s　]{1,15})?)\s*(?:さん|様)/,
];

/** NFKC, single spaces, trimmed; null if it doesn't look like a person's name. */
export function cleanName(raw: string): string | null {
  const name = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40 || /[@<>/\\]|https?:/i.test(name) || /^\d+$/.test(name)) {
    return null;
  }
  return name;
}

/** The same person's name regardless of spacing and width, for matching an entry to a notice. */
export const nameKey = (name: string) => name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

export function extractApplicantName(subject: string, text: string): string | null {
  for (const source of [subject, text]) {
    for (const pattern of NAME_PATTERNS) {
      const match = pattern.exec(source);
      const name = match ? cleanName(match[1]!) : null;
      if (name) return name;
    }
  }
  return null;
}

/** The company's job whose title appears in the email; the longest title wins. */
export function matchJob(
  subject: string,
  text: string,
  jobs: { id: string; title: string }[],
): string | null {
  const haystack = `${subject}\n${text}`.normalize("NFKC").toLowerCase();
  let best: { id: string; length: number } | null = null;
  for (const job of jobs) {
    const title = job.title.normalize("NFKC").trim().toLowerCase();
    if (title.length >= 2 && haystack.includes(title) && (!best || title.length > best.length)) {
      best = { id: job.id, length: title.length };
    }
  }
  return best?.id ?? null;
}

export type ParsedNotification =
  | { ok: true; channel: string; applicantName: string; jobId: string }
  | { ok: false; channel: string | null; reason: "board" | "name" | "job" };

export function parseNotification(input: {
  from: string;
  subject: string;
  text: string;
  jobs: { id: string; title: string }[];
}): ParsedNotification {
  const channel = detectBoard(input);
  if (!channel) return { ok: false, channel: null, reason: "board" };
  const applicantName = extractApplicantName(input.subject, input.text);
  if (!applicantName) return { ok: false, channel, reason: "name" };
  const jobId = matchJob(input.subject, input.text, input.jobs);
  if (!jobId) return { ok: false, channel, reason: "job" };
  return { ok: true, channel, applicantName, jobId };
}

/** The reply above the quoted original: what a candidate actually wrote. */
export function replyText(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex(
    (line) =>
      /^>/.test(line) ||
      /^On .+wrote:$/.test(line.trim()) ||
      /^\d{4}[/年].+(?:書きました|wrote)[:：]?$/.test(line.trim()) ||
      /^-{2,}\s*(?:Original Message|元のメッセージ)/i.test(line.trim()),
  );
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
}
