// AI eval runner (docs/05 §6.6): renders the synthetic applications, reads and screens them with the
// production code (readDocument, judgeApplication), and scores the result against the targets.
//
//   pnpm eval                      every case, live when ANTHROPIC_API_KEY is set (costs money)
//   pnpm eval --only sales-01,care-02 --concurrency 2
//   AI_FAKE=1 pnpm eval            the harness with fake AI: checks the plumbing, not the model
//
// Live runs save their results in tests/ai-evals/results/ and exit 1 when a target is missed.

import { AsyncLocalStorage } from "node:async_hooks";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { AI_MODEL, AiOutputError, aiMode, sendAiUsageTo, usageCostUsd } from "@/server/ai/client";
import { READ_PROMPT_VERSION, readDocument } from "@/server/ai/read-document";
import { SCREEN_PROMPT_VERSION } from "@/server/ai/screen";
import { judgeApplication, type ReadDoc, readPdf } from "@/server/screening/judge";
import { buildCases, EVAL_DIR, EVAL_SET_VERSION, type EvalCase, JOBS, SETTINGS } from "./cases";
import { type CaseResult, cer, scoreCase, summarize } from "./metrics";
import { type RenderedFile, renderCases } from "./render";

// The AI client reads the key when called, not when imported.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Optional: the key can come from the environment.
  }
}

const { values: args } = parseArgs({
  options: {
    only: { type: "string" },
    concurrency: { type: "string", default: "4" },
    "render-only": { type: "boolean", default: false },
  },
});

const usage = new AsyncLocalStorage<{ costUsd: number }>();
sendAiUsageTo((_feature, u) => {
  const store = usage.getStore();
  if (store) store.costUsd += usageCostUsd(u);
});

async function readOne(f: RenderedFile): Promise<{ doc: ReadDoc; ms: number; cer: number | null }> {
  const started = Date.now();
  const data = await readFile(f.file);
  const pdfText = f.mime === "application/pdf" ? ((await readPdf(data))?.text ?? null) : null;
  try {
    const result = await readDocument({ orgId: "eval", data, mime: f.mime, pdfText });
    return {
      doc: {
        kind: f.kind,
        readStatus: "done",
        readError: null,
        transcript: result.transcript,
        legibility: result.legibility,
        injectionSuspected: result.injection,
      },
      ms: Date.now() - started,
      // Text-layer PDFs are copied, not transcribed.
      cer: f.format === "pdf" ? null : cer(f.text, result.transcript),
    };
  } catch (error) {
    return {
      doc: {
        kind: f.kind,
        readStatus: "failed",
        readError: error instanceof AiOutputError ? error.reason : "error",
        transcript: null,
        legibility: null,
        injectionSuspected: false,
      },
      ms: Date.now() - started,
      cer: null,
    };
  }
}

async function runCase(c: EvalCase, files: RenderedFile[]): Promise<CaseResult> {
  const meter = { costUsd: 0 };
  return usage.run(meter, async () => {
    try {
      // Each file is its own pipeline step, so reads run side by side; screening follows.
      const reads = await Promise.all(files.map(readOne));
      const screenStarted = Date.now();
      const { decision } = await judgeApplication(
        {
          orgId: "eval",
          candidateName: c.person.name,
          criteria: JOBS[c.job].criteria,
          settings: SETTINGS,
          answers: c.answers,
          docs: reads.map((r) => r.doc),
        },
        true,
      );
      return {
        id: c.id,
        verdict: decision.verdict,
        reasons: decision.reasons,
        flags: decision.flags,
        outcomes: decision.outcomes,
        files: files.map((f, i) => ({
          kind: f.kind,
          format: f.format,
          readStatus: reads[i]!.doc.readStatus,
          cer: reads[i]!.cer,
        })),
        latencyMs: Math.max(...reads.map((r) => r.ms)) + (Date.now() - screenStarted),
        costUsd: meter.costUsd,
      };
    } catch (error) {
      return {
        id: c.id,
        verdict: "error",
        reasons: [],
        flags: {},
        outcomes: [],
        files: [],
        latencyMs: 0,
        costUsd: meter.costUsd,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

async function main() {
  const mode = aiMode();
  if (mode === "off" && !args["render-only"]) {
    console.error(
      "No ANTHROPIC_API_KEY: set it for a live run, or AI_FAKE=1 to check the harness.",
    );
    process.exit(1);
  }

  const only = args.only?.split(",").map((s) => s.trim());
  const cases = buildCases().filter((c) => !only || only.includes(c.id));
  console.log(`Eval set ${EVAL_SET_VERSION}: ${cases.length} cases, AI ${mode} (${AI_MODEL})`);
  process.stdout.write("Rendering documents ");
  const rendered = await renderCases(cases);
  console.log(" done");
  if (args["render-only"]) return;

  const results: CaseResult[] = [];
  const queue = [...cases];
  const concurrency = Math.max(1, Number(args.concurrency) || 4);
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let c = queue.shift(); c; c = queue.shift()) {
        const result = await runCase(c, rendered.get(c.id)!);
        results.push(result);
        const ok = result.verdict !== "error" && c.acceptableVerdicts.includes(result.verdict);
        console.log(
          `${ok ? "ok  " : "MISS"} ${c.id.padEnd(9)} ${result.verdict.padEnd(12)} expected ${c.acceptableVerdicts.join("|")}${result.error ? `  (${result.error})` : ""}`,
        );
      }
    }),
  );
  results.sort((a, b) => a.id.localeCompare(b.id));

  const scores = results.map((r) =>
    scoreCase(
      cases.find((c) => c.id === r.id)!,
      r,
    ),
  );
  const summary = summarize(scores, results);
  console.log(`\n${JSON.stringify(summary.metrics, null, 2)}`);
  for (const t of summary.targets)
    console.log(`${t.pass ? "PASS" : "FAIL"}  ${t.name}: ${t.value}`);

  if (mode !== "live") {
    console.log("\nFake AI: the numbers above check the harness, not the model. Nothing saved.");
    return;
  }
  const dir = path.join(EVAL_DIR, "results");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const report = {
    evalSet: EVAL_SET_VERSION,
    model: AI_MODEL,
    prompts: { read: READ_PROMPT_VERSION, screen: SCREEN_PROMPT_VERSION },
    ranAt: new Date().toISOString(),
    ...summary,
    cases: results.map((r, i) => ({ ...r, score: scores[i] })),
  };
  await writeFile(file, JSON.stringify(report, null, 2));
  console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
  process.exit(summary.pass ? 0 : 1);
}

void main();
