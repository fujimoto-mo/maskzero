import { normalizeForMatch } from "@/features/screening/text";

// Interview evaluation (docs/02 M11-3, M11-6): the rubric people and the AI rate against, the
// transcript format, and checks on the AI's quotes. Pure.

export const RUBRIC = [
  { id: "experience", label: "経験・スキル" },
  { id: "consistency", label: "書類との一貫性" },
  { id: "motivation", label: "志望動機・意欲" },
  { id: "communication", label: "コミュニケーション" },
  { id: "values", label: "価値観・社風との相性" },
] as const;
export type CriterionId = (typeof RUBRIC)[number]["id"];
export const RUBRIC_IDS = RUBRIC.map((c) => c.id) as CriterionId[];

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/** Average of the rated criteria, or null when nothing is rated. */
export function averageScore(scores: Partial<Record<string, number>>): number | null {
  const values = RUBRIC_IDS.map((id) => scores[id]).filter(
    (v): v is number => typeof v === "number" && v >= SCORE_MIN && v <= SCORE_MAX,
  );
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export type Segment = { t: number | null; speaker: string | null; text: string };

const CUE_TIME = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})|(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const ARROW = /-->/;
const SPEAKER = /^(?:<v\s+([^>]+)>|([^:：]{1,20})[:：]\s*)(.*)$/;

function seconds(match: RegExpMatchArray): number {
  if (match[1] !== undefined)
    return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number(match[5]) * 60 + Number(match[6]);
}

function splitSpeaker(line: string): { speaker: string | null; text: string } {
  const m = SPEAKER.exec(line.trim());
  if (!m) return { speaker: null, text: line.trim() };
  const speaker = (m[1] ?? m[2])?.trim() ?? null;
  return { speaker, text: (m[3] ?? "").replace(/<\/v>/g, "").trim() };
}

/**
 * Turns an uploaded transcript into segments: WebVTT or SRT (with times and, where given,
 * speakers) as most meeting tools export it, or plain text, one segment per non-empty line.
 */
export function parseTranscript(raw: string): Segment[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (!lines.some((l) => ARROW.test(l))) {
    return lines
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({ t: null, ...splitSpeaker(l) }));
  }
  const segments: Segment[] = [];
  let current: number | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "WEBVTT" || /^\d+$/.test(trimmed) || /^NOTE\b/.test(trimmed)) {
      continue;
    }
    if (ARROW.test(trimmed)) {
      const m = trimmed.match(CUE_TIME);
      current = m ? seconds(m) : null;
      continue;
    }
    const { speaker, text: said } = splitSpeaker(trimmed);
    if (said) segments.push({ t: current, speaker, text: said });
  }
  return segments;
}

/** "12:05" or "1:02:05" for a segment time. */
export function formatTime(t: number | null): string {
  if (t === null) return "";
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

/** The transcript as the AI sees it: one numbered line per segment, with its time. */
export function renderTranscript(segments: Segment[]): string {
  return segments
    .map(
      (s, i) =>
        `[${i}${s.t === null ? "" : ` ${formatTime(s.t)}`}] ${s.speaker ? `${s.speaker}: ` : ""}${s.text}`,
    )
    .join("\n");
}

/** Where a quote occurs in the transcript: its segment's time, and whether it is really there. */
export function locateQuote(
  quote: string,
  segments: Segment[],
): { t: number | null; verified: boolean } {
  const q = normalizeForMatch(quote);
  if (!q) return { t: null, verified: false };
  const hit = segments.find((s) => normalizeForMatch(s.text).includes(q));
  return hit ? { t: hit.t, verified: true } : { t: null, verified: false };
}

/** Rank of `total` among the totals of the same job and round, 1 = best (M11-6). */
export function rankAmong(total: number, others: number[]): { rank: number; of: number } {
  return { rank: others.filter((o) => o > total).length + 1, of: others.length + 1 };
}
