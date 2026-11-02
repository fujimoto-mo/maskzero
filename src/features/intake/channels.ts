// Job boards an entry URL can be issued for (docs/01 §5.7, docs/02 M3-1), in four groups. The
// name is stored as entry_urls.channel; anything else is a custom name typed by the user.

export const CHANNEL_GROUPS = [
  { label: "総合型", channels: ["Indeed", "求人ボックス", "スタンバイ", "engage"] },
  {
    label: "転職サイト",
    channels: [
      "doda",
      "マイナビ転職",
      "リクナビNEXT",
      "エン転職",
      "type",
      "ビズリーチ",
      "Green",
      "Wantedly",
      "ミドルの転職",
    ],
  },
  {
    label: "アルバイト",
    channels: [
      "バイトル",
      "タウンワーク",
      "マイナビバイト",
      "イーアイデム",
      "はたらいく",
      "ジモティー",
    ],
  },
  { label: "その他", channels: ["ハローワーク", "自社サイト", "紹介"] },
] as const;

export const KNOWN_CHANNELS: readonly string[] = CHANNEL_GROUPS.flatMap((g) => g.channels);

export const CUSTOM_CHANNEL_MAX = 30;

/** A channel name as stored: a known board, or a trimmed custom name; null if unusable. */
export function normalizeChannel(raw: string): string | null {
  const name = raw.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!name || name.length > CUSTOM_CHANNEL_MAX) return null;
  return KNOWN_CHANNELS.find((c) => c.toLowerCase() === name.toLowerCase()) ?? name;
}
