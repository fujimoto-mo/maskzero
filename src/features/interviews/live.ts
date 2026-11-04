// The meeting bot's live transcript and the AI's suggestions during an interview (docs/02 M11-5,
// M11-7). Pure helpers, shared by the webhook, the background jobs and the live page.

export const ASSIST_KINDS = ["deep_dive", "inconsistency", "skill_check", "missed_topic"] as const;
export type AssistKind = (typeof ASSIST_KINDS)[number];

/** One suggestion for the interviewer: what to ask next, and what in the conversation prompted it. */
export type AssistSuggestion = { kind: AssistKind; question: string; reason: string };

export type Utterance = { at: number | null; speaker: string | null; text: string };

/** Fewer than this many utterances give the AI too little to go on. */
export const ASSIST_MIN_SEGMENTS = 4;
export const MAX_SUGGESTIONS = 4;

const CJK = /[぀-ヿ㐀-鿿＀-￯]/;

/** Joins recognised words: Japanese without spaces, other languages with them. */
export function joinWords(words: string[]): string {
  const parts = words.map((w) => w.trim()).filter(Boolean);
  let out = "";
  for (const word of parts) {
    const glue = out && !(CJK.test(out.at(-1)!) || CJK.test(word[0]!)) ? " " : "";
    out += glue + word;
  }
  return out;
}

type RecallWord = { text?: unknown; start_timestamp?: { relative?: unknown } | null };

/**
 * One utterance from Recall.ai's `transcript.data` webhook, or null for anything else. The
 * payload is outside input: every field is checked.
 */
export function parseRecallTranscript(payload: unknown): Utterance | null {
  if (!payload || typeof payload !== "object") return null;
  const { event, data } = payload as { event?: unknown; data?: { data?: unknown } };
  if (event !== "transcript.data" || !data?.data || typeof data.data !== "object") return null;
  const inner = data.data as { words?: unknown; participant?: { name?: unknown } | null };
  if (!Array.isArray(inner.words)) return null;
  const words = (inner.words as RecallWord[]).filter(
    (w): w is RecallWord & { text: string } => typeof w?.text === "string",
  );
  const text = joinWords(words.map((w) => w.text)).slice(0, 2000);
  if (!text) return null;
  const start = words[0]?.start_timestamp?.relative;
  const name = inner.participant?.name;
  return {
    at: typeof start === "number" && Number.isFinite(start) ? Math.max(0, start) : null,
    speaker: typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : null,
    text,
  };
}

/** Recall's speaker labels say nothing about roles; the bot itself never speaks. */
export function renderLive(utterances: Utterance[]): string {
  return utterances
    .map((u) => {
      const time =
        u.at === null
          ? ""
          : `[${String(Math.floor(u.at / 60)).padStart(2, "0")}:${String(Math.floor(u.at % 60)).padStart(2, "0")}] `;
      return `${time}${u.speaker ?? "話者"}：${u.text}`;
    })
    .join("\n");
}

/**
 * What the fake meeting bot "hears" (INTEGRATIONS_FAKE=1): an invented first interview for a
 * sales job, one utterance every few seconds.
 */
export const FAKE_INTERVIEW: { speaker: "interviewer" | "candidate"; text: string }[] = [
  {
    speaker: "interviewer",
    text: "本日はお時間をいただきありがとうございます。まず自己紹介をお願いできますか。",
  },
  {
    speaker: "candidate",
    text: "はい、よろしくお願いします。今は食品メーカーで法人営業を5年ほど担当しています。",
  },
  { speaker: "interviewer", text: "法人営業では、どのようなお客様を担当されていますか。" },
  {
    speaker: "candidate",
    text: "スーパーや飲食チェーンが中心で、新規の開拓と既存のお取引の両方を見ています。",
  },
  { speaker: "interviewer", text: "成果として印象に残っていることはありますか。" },
  {
    speaker: "candidate",
    text: "昨年は担当エリアの売上を前年より2割ほど伸ばしました。チームで提案の型を作ったのが大きかったです。",
  },
  { speaker: "interviewer", text: "今回、転職を考えた理由を教えてください。" },
  {
    speaker: "candidate",
    text: "もっと顧客の課題に深く入り込める商材を扱いたいと思ったからです。あと、残業が多いのも少し気になっていました。",
  },
  { speaker: "interviewer", text: "なるほど。入社の時期はいつ頃をお考えですか。" },
  { speaker: "candidate", text: "引き継ぎがあるので、2か月後くらいを考えています。" },
  { speaker: "interviewer", text: "最後に、何かご質問はありますか。" },
  { speaker: "candidate", text: "配属後の研修と、評価の仕組みについて教えていただけますか。" },
];
