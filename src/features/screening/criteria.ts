import { z } from "zod";
import type { Criterion } from "./domain";

// Stored screening_criteria rows ↔ the Criterion type decide() works with. The config schemas
// also validate what the criteria editor saves (docs/02 M4-2).

export const MAX_CHOICES = 8;

export const choicesConfigSchema = z.object({
  options: z.array(z.string().trim().min(1).max(50)).min(2).max(MAX_CHOICES),
  pass: z.array(z.string()).min(1),
  multi: z.boolean().optional(),
  answerKey: z.string().max(40).optional(),
});

export const dropdownConfigSchema = z.object({
  options: z.array(z.string().trim().min(1).max(50)).min(2).max(20),
  line: z.string(),
  dir: z.enum(["upto", "from"]),
  answerKey: z.string().max(40).optional(),
});

export const rangeConfigSchema = z.object({
  min: z.number().finite().nullable().optional(),
  max: z.number().finite().nullable().optional(),
  unit: z.string().trim().max(10),
  answerKey: z.string().max(40).optional(),
});

export type CriterionRow = {
  id: string;
  type: "basic" | "specialist";
  label: string;
  kind: "choices" | "dropdown" | "range" | null;
  source: "form" | "resume" | null;
  config: unknown;
  required: boolean;
  weight: number;
};

/** A stored row as a Criterion, or null when its config is unusable (it is then left out). */
export function toCriterion(row: CriterionRow): Criterion | null {
  const base = { id: row.id, label: row.label, required: row.required, weight: row.weight };
  if (row.type === "specialist") return { ...base, type: "specialist" };
  if (!row.source) return null;
  switch (row.kind) {
    case "choices": {
      const config = choicesConfigSchema.safeParse(row.config);
      return config.success
        ? { ...base, type: "basic", kind: "choices", source: row.source, config: config.data }
        : null;
    }
    case "dropdown": {
      const config = dropdownConfigSchema.safeParse(row.config);
      return config.success && config.data.options.includes(config.data.line)
        ? { ...base, type: "basic", kind: "dropdown", source: row.source, config: config.data }
        : null;
    }
    case "range": {
      const config = rangeConfigSchema.safeParse(row.config);
      return config.success
        ? { ...base, type: "basic", kind: "range", source: row.source, config: config.data }
        : null;
    }
    default:
      return null;
  }
}
