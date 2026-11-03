import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Browser, chromium, type Page } from "@playwright/test";
import sharp from "sharp";
import { type DocFormat, EVAL_DIR, EVAL_SET_VERSION, type EvalCase } from "./cases";
import { cvHtml, resumeHtml } from "./documents";

// Turns a case into the files an applicant would upload: a text PDF, an image-only "scanned" PDF,
// or phone photos (one per page). Files are cached under tests/ai-evals/.cache and rebuilt when the
// generator changes. Set PLAYWRIGHT_CHANNEL=chrome (or msedge) to use an installed browser.

export type RenderedFile = {
  kind: "resume" | "cv";
  format: DocFormat;
  file: string;
  mime: "application/pdf" | "image/jpeg";
  /** The text on the page(s), for the character error rate of transcribed photos. */
  text: string;
};

const CACHE = path.join(EVAL_DIR, ".cache", EVAL_SET_VERSION);

function seeded(id: string) {
  let n = createHash("sha256").update(id).digest().readUInt32BE(0);
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

/** A phone photo of a page on a desk: tilted, darker, softer, with a shadow toward one corner. */
async function photograph(png: Buffer, format: DocFormat, rand: () => number): Promise<Buffer> {
  const hard = format === "photo_hard";
  const meta = await sharp(png).metadata();
  const pad = Math.round(meta.width! * 0.07);
  const angle = (rand() < 0.5 ? -1 : 1) * (hard ? 5 + rand() * 3 : 1 + rand() * 2);
  const framed = await sharp(png)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: "#6f6253" })
    .rotate(angle, { background: "#6f6253" })
    .toBuffer();
  const { width, height } = await sharp(framed).metadata();
  const shadow = Buffer.from(
    `<svg width="${width}" height="${height}"><defs><radialGradient id="g" cx="${rand() < 0.5 ? 20 : 80}%" cy="15%" r="95%">
<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#${hard ? "5a5a5a" : "a8a8a8"}"/></radialGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  // sharp composites after resizing, so shade at full size first.
  const shaded = await sharp(framed)
    .composite([{ input: shadow, blend: "multiply" }])
    .toBuffer();
  return sharp(shaded)
    .modulate({ brightness: hard ? 0.72 : 0.92 })
    .blur(hard ? 1.6 : 0.6)
    .resize({ width: hard ? 1100 : 1500 })
    .jpeg({ quality: hard ? 48 : 72 })
    .toBuffer();
}

async function scan(png: Buffer, rand: () => number): Promise<Buffer> {
  return sharp(png)
    .rotate((rand() - 0.5) * 1.2, { background: "#ffffff" })
    .grayscale()
    .linear(1.15, -12)
    .jpeg({ quality: 78 })
    .toBuffer();
}

async function pageShots(page: Page): Promise<{ png: Buffer; text: string }[]> {
  const shots = [];
  for (const section of await page.locator(".page").all()) {
    shots.push({ png: await section.screenshot({ type: "png" }), text: await section.innerText() });
  }
  return shots;
}

async function renderDoc(
  page: Page,
  c: EvalCase,
  doc: EvalCase["docs"][number],
  dir: string,
  rand: () => number,
): Promise<RenderedFile[]> {
  const html = doc.kind === "resume" ? resumeHtml(c, doc.format === "handwritten") : cvHtml(c);
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  if (doc.format === "pdf") {
    const file = path.join(dir, `${doc.kind}.pdf`);
    await writeFile(file, await page.pdf({ format: "A4", printBackground: true }));
    const text = (await pageShots(page)).map((s) => s.text).join("\n");
    return [{ kind: doc.kind, format: doc.format, file, mime: "application/pdf", text }];
  }

  const shots = await pageShots(page);
  if (doc.format === "scan") {
    const images = await Promise.all(shots.map((s) => scan(s.png, rand)));
    const pages = images
      .map(
        (img) =>
          `<div style="height:296mm;display:flex;align-items:center;justify-content:center;break-after:page">` +
          `<img src="data:image/jpeg;base64,${img.toString("base64")}" style="max-width:100%;max-height:296mm"></div>`,
      )
      .join("");
    await page.setContent(`<html><body style="margin:0">${pages}</body></html>`);
    const file = path.join(dir, `${doc.kind}-scan.pdf`);
    await writeFile(file, await page.pdf({ format: "A4", margin: { top: "0", bottom: "0" } }));
    const text = shots.map((s) => s.text).join("\n");
    return [{ kind: doc.kind, format: doc.format, file, mime: "application/pdf", text }];
  }

  // Photos and handwritten forms: one picture per page, as people send them from a phone.
  const files: RenderedFile[] = [];
  for (const [i, shot] of shots.entries()) {
    const file = path.join(dir, `${doc.kind}-${i + 1}.jpg`);
    await writeFile(file, await photograph(shot.png, doc.format, rand));
    files.push({ kind: doc.kind, format: doc.format, file, mime: "image/jpeg", text: shot.text });
  }
  return files;
}

/** Fingerprint of everything that shapes a case's files, so edits to the generator re-render. */
async function fingerprint(c: EvalCase): Promise<string> {
  const sources = await Promise.all(
    ["cases.ts", "documents.ts", "render.ts"].map((f) => readFile(path.join(EVAL_DIR, f))),
  );
  const hash = createHash("sha256").update(JSON.stringify(c));
  for (const s of sources) hash.update(s);
  return hash.digest("hex");
}

export async function renderCases(cases: EvalCase[]): Promise<Map<string, RenderedFile[]>> {
  const out = new Map<string, RenderedFile[]>();
  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    for (const c of cases) {
      const dir = path.join(CACHE, c.id);
      const manifestPath = path.join(dir, "manifest.json");
      const print = await fingerprint(c);
      const cached = await readFile(manifestPath, "utf8")
        .then((s) => JSON.parse(s) as { print: string; files: RenderedFile[] })
        .catch(() => null);
      if (cached?.print === print) {
        out.set(c.id, cached.files);
        continue;
      }
      browser ??= await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
      page ??= await browser.newPage({
        viewport: { width: 794, height: 1123 },
        deviceScaleFactor: 2,
      });
      await mkdir(dir, { recursive: true });
      const rand = seeded(c.id);
      const files: RenderedFile[] = [];
      for (const doc of c.docs) files.push(...(await renderDoc(page, c, doc, dir, rand)));
      await writeFile(manifestPath, JSON.stringify({ print, files }, null, 2));
      out.set(c.id, files);
      process.stdout.write(".");
    }
  } finally {
    await browser?.close();
  }
  return out;
}
