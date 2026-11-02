import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAdminDb } from "@/server/db/admin";
import { aiUsage } from "@/server/db/schema";

/** One model for every AI step (docs/05 §6.2); change it here and re-run the evals. */
export const AI_MODEL = "claude-opus-5-5";
/** Refusals are re-run server-side on Anthropic's recommended model for the refusal category. */
export const AI_BETAS = ["server-side-fallback-2026-07-01"];

/**
 * live: Claude via ANTHROPIC_API_KEY. fake: deterministic local results (AI_FAKE=1, development and
 * tests only). off: no key; applications wait until AI is set up.
 */
export type AiMode = "live" | "fake" | "off";

export function aiMode(): AiMode {
  if (process.env.AI_FAKE === "1") return "fake";
  return process.env.ANTHROPIC_API_KEY ? "live" : "off";
}

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  // Retries on 429/5xx come from the SDK (2 by default) and from Inngest steps.
  client ??= new Anthropic();
  return client;
}

// Claude Opus 5.5 list prices in USD per million tokens (cache writes: 1.25 × input).
const PRICE = { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 };

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

export function usageCostUsd(u: Usage): number {
  const cost =
    u.input_tokens * PRICE.input +
    u.output_tokens * PRICE.output +
    (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite +
    (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead;
  return cost / 1_000_000;
}

/** Meters every live call per org (docs/02 M13-4). */
export async function recordAiUsage(orgId: string, feature: string, usage: Usage): Promise<void> {
  await getAdminDb()
    .insert(aiUsage)
    .values({
      orgId,
      feature,
      model: AI_MODEL,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      costUsd: usageCostUsd(usage).toFixed(4),
    });
}

/** A stop reason that means the output can't be used for a verdict. */
export class AiOutputError extends Error {
  constructor(readonly reason: "refusal" | "max_tokens" | "invalid_output") {
    super(`AI output unusable: ${reason}`);
  }
}
