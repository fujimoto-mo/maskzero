import "server-only";
import { extractText } from "unpdf";
import {
  type AiCriterionResult,
  type Criterion,
  type Decision,
  decide,
  type Flags,
  type Settings,
} from "@/features/screening/domain";
import { maskForScreening } from "@/features/screening/text";
import { AiOutputError, aiMode } from "@/server/ai/client";
import { needsAi, screenWithAi } from "@/server/ai/screen";

// The screening step without the database: from read documents to a decision. The pipeline and
// the AI eval runner (tests/ai-evals) both use it, so the evals measure what production does.

export async function readPdf(data: Buffer): Promise<{ pages: number; text: string } | null> {
  try {
    // pdf.js takes ownership of the bytes it is given, so pass a copy.
    const { totalPages, text } = await extractText(new Uint8Array(data), { mergePages: true });
    return { pages: totalPages, text };
  } catch {
    return null; // damaged or encrypted
  }
}

export type ReadDoc = {
  kind: "resume" | "cv" | "other";
  readStatus: "pending" | "done" | "failed" | "skipped";
  readError: string | null;
  transcript: string | null;
  legibility: string | null;
  injectionSuspected: boolean;
};

const KIND_LABELS = { resume: "履歴書", cv: "職務経歴書", other: "書類" } as const;

/**
 * Flags from the documents, the AI's proposal on the masked text, and the verdict from decide().
 * Errors other than unusable AI output are thrown for a retry, except on the last attempt.
 */
export async function judgeApplication(
  input: {
    orgId: string;
    candidateName: string;
    criteria: Criterion[];
    settings: Settings;
    answers: Record<string, string | string[] | number>;
    docs: ReadDoc[];
  },
  lastAttempt: boolean,
): Promise<{ decision: Decision; model: string | null; maskedText: string }> {
  const { docs, criteria } = input;
  const flags: Flags = {};
  const read = docs.filter((d) => d.readStatus === "done");
  // A photo the AI could not make out has no text at all, so judge legibility on every read document.
  const readable = read.filter((d) => d.transcript);
  if (!docs.some((d) => d.kind === "resume")) flags.noDocuments = true;
  for (const d of docs.filter((d) => d.readStatus === "failed")) {
    if (d.readError === "refusal") flags.refusal = true;
    else flags.invalidOutput = true;
  }
  if (read.some((d) => d.legibility !== "good")) flags.lowLegibility = true;
  if (read.some((d) => d.injectionSuspected)) flags.injection = true;

  const text = readable.map((d) => `【${KIND_LABELS[d.kind]}】\n${d.transcript}`).join("\n\n");
  const masked = maskForScreening(text, [input.candidateName]);

  let ai: AiCriterionResult[] = [];
  let model: string | null = null;
  if (readable.length > 0 && criteria.some(needsAi)) {
    if (aiMode() === "off") {
      flags.aiUnavailable = true;
    } else {
      try {
        const result = await screenWithAi({ orgId: input.orgId, criteria, maskedText: masked });
        ai = result.results;
        model = result.model;
        if (result.injection) flags.injection = true;
      } catch (error) {
        if (error instanceof AiOutputError) {
          if (error.reason === "refusal") flags.refusal = true;
          else flags.invalidOutput = true;
        } else if (lastAttempt) {
          flags.aiUnavailable = true;
        } else {
          throw error;
        }
      }
    }
  }

  const decision = decide({
    criteria,
    settings: input.settings,
    answers: input.answers,
    ai,
    documentText: masked,
    flags,
  });
  return { decision, model, maskedText: masked };
}
