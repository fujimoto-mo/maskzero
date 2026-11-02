import type { Verdict } from "./domain";

/** Filter tabs of the screening screen, and the verdicts each one shows. */
export const SCREENING_FILTERS = [
  "all",
  "pass",
  "check",
  "fail_pending",
  "fail",
  "pending",
] as const;
export type ScreeningFilter = (typeof SCREENING_FILTERS)[number];

export const FILTER_VERDICTS: Record<Exclude<ScreeningFilter, "all">, Verdict[]> = {
  pass: ["pass", "manual_pass"],
  check: ["check", "manual_check"],
  fail_pending: ["fail_pending"],
  fail: ["fail", "manual_fail"],
  pending: ["pending"],
};

export const isScreeningFilter = (value: unknown): value is ScreeningFilter =>
  typeof value === "string" && (SCREENING_FILTERS as readonly string[]).includes(value);
