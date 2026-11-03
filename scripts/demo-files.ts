// Builds the applicants of the /demo sandbox (docs/02 M0-4) from the AI eval generator: their
// documents as text PDFs and the AI's proposal for each condition, with quotes taken from the
// documents' own text. Writes src/features/demo/files/. Run after changing the eval generator:
//
//   PLAYWRIGHT_CHANNEL=chrome pnpm demo:files

import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { type AiCriterionResult, decide, type Verdict } from "@/features/screening/domain";
import { maskForScreening } from "@/features/screening/text";
import { readPdf } from "@/server/screening/judge";
import { buildCases, type EvalCase, JOBS, SETTINGS } from "../tests/ai-evals/cases";
import { renderCases } from "../tests/ai-evals/render";

const OUT = path.join(process.cwd(), "src", "features", "demo", "files");

/** How many applicants of each job end where: enough to show every list without a long wait. */
const WANTED: Record<string, Partial<Record<Verdict, number>>> = {
  sales: { pass: 4, check: 1, fail_pending: 1 },
  care: { pass: 2, check: 1, fail_pending: 1 },
};

/** Lines that would support each condition, most specific first. */
function supporting(c: EvalCase, criterionId: string): string[] {
  const p = c.person;
  const lines = (pred: (w: EvalCase["person"]["work"][number]) => boolean) =>
    p.work.filter(pred).flatMap((w) => w.duties);
  switch (criterionId) {
    case "s_licence":
      return ["普通自動車第一種運転免許 取得"];
    case "s_years":
    case "c_years":
      return p.work.map((w) => `${w.company} 入社（${w.dept}）`);
    case "s_b2b":
      return lines(() => true);
    case "s_lead":
      return lines((w) => w.lead).filter((d) => d.includes("チーム"));
    case "c_cert":
      return p.licences.map((l) => l.name);
    case "c_night":
      return lines((w) => w.night).filter((d) => d.includes("夜勤"));
    case "c_dementia":
      return lines((w) => w.dementia).filter((d) => d.includes("認知症"));
    default:
      return [];
  }
}

/** The AI's proposal as a careful reader would make it: the facts, quoted from the documents. */
function proposal(c: EvalCase, text: string): AiCriterionResult[] {
  return c.labels.map((label) => {
    const quote = supporting(c, label.criterionId).find((s) => text.includes(s)) ?? null;
    if (label.kind === "number") {
      return {
        criterionId: label.criterionId,
        value: String(label.truths[0]),
        match: "yes",
        evidence: quote,
      };
    }
    if (label.kind === "value") {
      const value = quote ? (label.accept.find((v) => v !== null && v !== "なし") ?? null) : null;
      return {
        criterionId: label.criterionId,
        value,
        match: value === null ? "not_stated" : "yes",
        evidence: value === null ? null : quote,
      };
    }
    const match = quote ? label.accept[0]! : label.accept.includes("no") ? "no" : "not_stated";
    return {
      criterionId: label.criterionId,
      value: null,
      match,
      evidence: match === "not_stated" ? null : quote,
    };
  });
}

async function main() {
  const candidates = buildCases().filter(
    (c) => !c.injection && c.docs.every((d) => d.format === "pdf"),
  );
  const rendered = await renderCases(candidates);
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const counts: Record<string, Partial<Record<Verdict, number>>> = { sales: {}, care: {} };
  const people = [];
  for (const c of candidates) {
    const files = rendered.get(c.id)!;
    const texts = await Promise.all(
      files.map(async (f) => (await readPdf(await readFile(f.file)))?.text.trim() ?? ""),
    );
    const text = files
      .map((f, i) => `【${f.kind === "resume" ? "履歴書" : "職務経歴書"}】\n${texts[i]}`)
      .join("\n\n");
    const masked = maskForScreening(text, [c.person.name]);
    const ai = proposal(c, masked);
    const decision = decide({
      criteria: JOBS[c.job].criteria,
      settings: SETTINGS,
      answers: c.answers,
      ai,
      documentText: masked,
      flags: {},
    });
    if (decision.flags.unverifiedEvidence) throw new Error(`${c.id}: a quote isn't in the text`);
    const wanted = WANTED[c.job]![decision.verdict] ?? 0;
    const have = counts[c.job]![decision.verdict] ?? 0;
    if (have >= wanted) continue;
    counts[c.job]![decision.verdict] = have + 1;

    const copied = [];
    for (const f of files) {
      const name = `${c.id}-${f.kind}.pdf`;
      await copyFile(f.file, path.join(OUT, name));
      copied.push({ kind: f.kind, file: name });
    }
    const prefecture = c.person.address.match(/^.+?[都道府県]/)![0];
    people.push({
      key: c.id,
      job: c.job,
      verdict: decision.verdict,
      name: c.person.name,
      kana: c.person.kana,
      email: c.person.email,
      phone: c.person.phone,
      prefecture,
      city: c.person.address.slice(prefecture.length).replace(/[\d-]+$/, ""),
      answers: c.answers,
      files: copied,
      ai,
    });
  }
  await writeFile(path.join(OUT, "people.json"), `${JSON.stringify(people, null, 2)}\n`);
  console.log(`\n${people.length} applicants:`, JSON.stringify(counts));
}

void main();
