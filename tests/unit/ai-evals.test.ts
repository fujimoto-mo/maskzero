import { describe, expect, it } from "vitest";
import type { CriterionOutcome } from "@/features/screening/domain";
import { buildCases, CASE_COUNT, type EvalCase } from "../ai-evals/cases";
import {
  type CaseResult,
  cer,
  levenshtein,
  scoreCase,
  summarize,
  TARGETS,
} from "../ai-evals/metrics";

const cases = buildCases();

describe("eval cases", () => {
  it("are the same on every run", () => {
    expect(JSON.stringify(buildCases())).toBe(JSON.stringify(cases));
  });

  it("cover both jobs, every format, injections and every kind of outcome", () => {
    expect(cases).toHaveLength(CASE_COUNT);
    expect(CASE_COUNT).toBeGreaterThanOrEqual(50);
    expect(new Set(cases.map((c) => c.id)).size).toBe(CASE_COUNT);
    expect(new Set(cases.map((c) => c.job))).toEqual(new Set(["sales", "care"]));
    const formats = new Set(cases.flatMap((c) => c.docs.map((d) => d.format)));
    expect(formats).toEqual(new Set(["pdf", "scan", "photo", "photo_hard", "handwritten"]));
    const injections = cases.filter((c) => c.injection);
    expect(injections.length).toBeGreaterThanOrEqual(5);
    for (const c of injections) expect(c.acceptableVerdicts).toEqual(["check"]);
    const verdicts = new Set(cases.flatMap((c) => c.acceptableVerdicts));
    for (const v of ["pass", "check", "fail_pending"]) expect(verdicts).toContain(v);
  });

  it("never put someone who meets the required conditions up for rejection", () => {
    for (const c of cases.filter((c) => c.job === "sales")) {
      const licence = c.labels.find((l) => l.criterionId === "s_licence");
      const b2b = c.labels.find((l) => l.criterionId === "s_b2b");
      if (
        licence?.kind === "value" &&
        licence.accept.includes("あり") &&
        b2b?.kind === "match" &&
        b2b.accept.includes("yes")
      ) {
        expect(c.acceptableVerdicts).not.toContain("fail_pending");
      }
    }
  });

  it("only invent contact details that can't reach anyone", () => {
    for (const c of cases) {
      expect(c.person.email).toMatch(/@example\.com$/);
      expect(c.person.phone).toMatch(/^090-0000-/);
      expect(c.person.address).toContain("架空区");
    }
  });
});

describe("cer", () => {
  it("ignores whitespace and full-width differences", () => {
    expect(cer("履歴書 ２０２６年", "履歴書2026年")).toBe(0);
  });

  it("counts edits against the truth's length", () => {
    expect(levenshtein("営業経験", "営業経歴")).toBe(1);
    expect(cer("あいうえおかきくけこ", "あいうえおかきくけ")).toBeCloseTo(0.1);
    expect(cer("", "")).toBe(0);
  });
});

function outcome(
  criterionId: string,
  value: string | null,
  match: CriterionOutcome["match"],
): CriterionOutcome {
  return {
    criterionId,
    label: criterionId,
    type: match ? "specialist" : "basic",
    required: false,
    weight: 20,
    value,
    met: null,
    match,
    points: 0,
    evidence: "quote",
    evidenceVerified: true,
  };
}

function result(c: EvalCase, overrides: Partial<CaseResult>): CaseResult {
  return {
    id: c.id,
    verdict: c.acceptableVerdicts[0]!,
    reasons: [],
    flags: {},
    outcomes: [],
    files: [],
    latencyMs: 1000,
    costUsd: 0.1,
    ...overrides,
  };
}

describe("scoreCase", () => {
  const strong = cases.find((c) => c.id === "sales-01")!;

  it("checks values, numbers within a year and matches against the labels", () => {
    const score = scoreCase(
      strong,
      result(strong, {
        outcomes: [
          outcome("s_licence", "あり", null),
          outcome("s_years", "9", null),
          outcome("s_b2b", null, "yes"),
          outcome("s_lead", null, "yes"),
        ],
      }),
    );
    expect(score.verdictOk).toBe(true);
    const ok = Object.fromEntries(score.criteria.map((c) => [c.criterionId, c.ok]));
    expect(ok).toEqual({ s_licence: true, s_years: true, s_b2b: true, s_lead: false });
  });

  it("counts a rejection the facts don't support as a false rejection", () => {
    expect(scoreCase(strong, result(strong, { verdict: "fail_pending" })).falseRejection).toBe(
      true,
    );
    const unfit = cases.find((c) => c.acceptableVerdicts.includes("fail_pending"))!;
    expect(scoreCase(unfit, result(unfit, { verdict: "fail_pending" })).falseRejection).toBe(false);
  });

  it("counts an injection as caught only when it went to a person for that reason", () => {
    const injected = cases.find((c) => c.injection)!;
    expect(
      scoreCase(injected, result(injected, { verdict: "check", flags: { injection: true } }))
        .injectionCaught,
    ).toBe(true);
    expect(
      scoreCase(injected, result(injected, { verdict: "check", flags: {} })).injectionCaught,
    ).toBe(false);
    expect(scoreCase(strong, result(strong, {})).injectionCaught).toBeNull();
  });
});

describe("summarize", () => {
  it("passes when every target is met and fails on a single false rejection", () => {
    const sample = cases.filter((c) => !c.injection).slice(0, 10);
    const good = sample.map((c) => result(c, {}));
    const pass = summarize(
      sample.map((c, i) => scoreCase(c, good[i]!)),
      good,
    );
    expect(pass.pass).toBe(true);
    expect(pass.metrics.verdictAgreement).toBe(1);

    const strong = sample.find((c) => !c.acceptableVerdicts.includes("fail_pending"))!;
    const bad = good.map((r) =>
      r.id === strong.id ? { ...r, verdict: "fail_pending" as const } : r,
    );
    const fail = summarize(
      sample.map((c, i) => scoreCase(c, bad[i]!)),
      bad,
    );
    expect(fail.metrics.falseRejections).toBe(1);
    expect(fail.targets.find((t) => t.name === "falseRejections")?.pass).toBe(false);
    expect(TARGETS.falseRejections).toBe(0);
  });
});
