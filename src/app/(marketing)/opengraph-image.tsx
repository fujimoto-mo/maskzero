import { cacheLife } from "next/cache";
import { ImageResponse } from "next/og";
// Read straight from the messages: `alt` must be a static export, and this route renders outside React.
import messages from "@/messages/ja-marketing.json";
import { BRAND_NAME } from "./_components/site-config";

const og = messages.Site.og;

export const alt = og.alt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// sRGB equivalents of the theme tokens in src/app/globals.css (Satori can't read CSS variables or oklch).
const COLORS = {
  primary: "#3f40c4", // --primary oklch(0.46 0.2 275)
  accent: "#eef0ff", // --accent oklch(0.96 0.02 275)
  foreground: "#0a0a0a", // --foreground oklch(0.145 0 0)
  muted: "#737373", // --muted-foreground oklch(0.556 0 0)
  background: "#ffffff", // --background
};

/** Noto Sans JP Bold from Google Fonts, subset to the characters on the card. */
async function loadNotoSansJpBold(text: string): Promise<ArrayBuffer> {
  "use cache";
  cacheLife("max");
  const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(cssUrl)).text();
  const fontUrl = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!fontUrl) throw new Error("Noto Sans JP: no font file in the Google Fonts response");
  const response = await fetch(fontUrl);
  if (!response.ok) throw new Error(`Noto Sans JP: HTTP ${response.status}`);
  return response.arrayBuffer();
}

export default async function OpengraphImage() {
  const chips = [og.chips.screening, og.chips.scheduling, og.chips.interview];
  const characters = [BRAND_NAME, og.eyebrow, og.title, og.subtitle, ...chips].join("");
  // Without the font (e.g. no network during the build), next/og falls back to its bundled font
  // and fetches Japanese glyphs itself.
  const font = await loadNotoSansJpBold(Array.from(new Set(characters)).join("")).catch(() => null);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: `linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.background} 65%)`,
        color: COLORS.foreground,
        fontFamily: font ? "Noto Sans JP" : undefined,
        fontWeight: 700,
      }}
    >
      <div style={{ display: "flex", fontSize: 48, letterSpacing: -1 }}>
        <span>{BRAND_NAME.slice(0, -1)}</span>
        <span style={{ color: COLORS.primary }}>{BRAND_NAME.slice(-1)}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 28, color: COLORS.primary }}>{og.eyebrow}</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 72, lineHeight: 1.25 }}>
          {og.title}
        </div>
        <div style={{ display: "flex", marginTop: 24, fontSize: 30, color: COLORS.muted }}>
          {og.subtitle}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        {chips.map((chip) => (
          <div
            key={chip}
            style={{
              display: "flex",
              padding: "10px 26px",
              borderRadius: 999,
              background: COLORS.primary,
              color: COLORS.background,
              fontSize: 28,
            }}
          >
            {chip}
          </div>
        ))}
      </div>
    </div>,
    {
      ...size,
      fonts: font
        ? [{ name: "Noto Sans JP", data: font, weight: 700, style: "normal" }]
        : undefined,
    },
  );
}
