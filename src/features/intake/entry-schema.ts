import { z } from "zod";
import { PAY_BANDS, START_TIMINGS } from "@/features/screening/presets";
import { isPlausiblePhone } from "@/lib/contact";
import { PREFECTURES } from "./prefectures";

// What the public entry page sends (docs/02 M3-3, M3-4). Shared by the browser, which validates each
// step as the candidate goes, and POST /api/entry/{code}, which validates again. Error messages are
// keys under Entry.errors.

export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_KIND = 4;

export type DocumentKind = "resume" | "cv";

export const entryFileSchema = z.object({
  kind: z.enum(["resume", "cv"]),
  name: z.string().trim().min(1).max(200),
  type: z.enum(DOCUMENT_TYPES),
  size: z.number().int().positive().max(MAX_DOCUMENT_BYTES),
});

export type EntryFile = z.infer<typeof entryFileSchema>;

export const filesSchema = z
  .array(entryFileSchema)
  .max(MAX_FILES_PER_KIND * 2)
  .refine(
    (files) =>
      files.filter((f) => f.kind === "resume").length <= MAX_FILES_PER_KIND &&
      files.filter((f) => f.kind === "cv").length <= MAX_FILES_PER_KIND,
    "tooManyFiles",
  );

/** Step 2: contact details and the standard questions. */
export const contactSchema = z.object({
  name: z.string().trim().min(1, "nameRequired").max(50, "nameTooLong"),
  phone: z.string().trim().max(30).refine(isPlausiblePhone, "phoneInvalid"),
  email: z.email("emailInvalid").max(254, "emailInvalid"),
  prefecture: z.enum(PREFECTURES, "prefectureRequired"),
  city: z.string().trim().min(1, "cityRequired").max(50, "cityTooLong"),
  payBand: z.enum(PAY_BANDS, "choiceRequired"),
  startTiming: z.enum(START_TIMINGS, "choiceRequired"),
});

export const answerValueSchema = z.union([
  z.string().trim().max(200),
  z.array(z.string().max(200)).max(8),
  z.number().finite(),
]);

export type AnswerValue = z.infer<typeof answerValueSchema>;

export const entrySchema = contactSchema.extend({
  /** Answers to the job's own questions, keyed by criterion id. */
  answers: z.record(z.string().max(64), answerValueSchema),
  files: filesSchema.refine((files) => files.some((f) => f.kind === "resume"), "resumeRequired"),
  consent: z.literal(true, "consentRequired"),
  otherJobsOptIn: z.boolean(),
  /** Honeypot: hidden from people, filled in by naive bots. */
  website: z.string().max(200).optional(),
  /** Time from opening the page to submitting; implausibly fast entries are bots. */
  elapsedMs: z.number().int().min(0).max(86_400_000),
});

export type EntryInput = z.infer<typeof entrySchema>;

/** A job question generated from a form-sourced screening condition. */
export type EntryQuestion =
  | { id: string; label: string; kind: "choices"; options: string[]; multi: boolean }
  | { id: string; label: string; kind: "dropdown"; options: string[] }
  | { id: string; label: string; kind: "range"; unit: string };

/** Keeps only answers that fit their question; anything else counts as unanswered. */
export function cleanAnswers(
  questions: EntryQuestion[],
  answers: Record<string, AnswerValue>,
): Record<string, AnswerValue> {
  const clean: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const value = answers[q.id];
    if (value === undefined || value === "") continue;
    if (q.kind === "range") {
      const number = typeof value === "number" ? value : Number(value);
      if (Number.isFinite(number)) clean[q.id] = number;
    } else if (q.kind === "choices" && q.multi) {
      const picked = (Array.isArray(value) ? value : [String(value)]).filter((v) =>
        q.options.includes(v),
      );
      if (picked.length > 0) clean[q.id] = picked;
    } else if (typeof value === "string" && q.options.includes(value)) {
      clean[q.id] = value;
    }
  }
  return clean;
}
