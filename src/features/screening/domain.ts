import { quoteIsInText } from "./text";

// Screening rules (docs/02 M4, docs/05 §6.5). The AI extracts values and quotes; this module turns
// them into points and a verdict. Pure and deterministic, so every verdict can be explained and
// re-computed. No I/O.

export type Verdict =
  | "pending"
  | "pass"
  | "check"
  | "fail_pending"
  | "fail"
  | "manual_pass"
  | "manual_check"
  | "manual_fail";

export type ChoicesConfig = {
  options: string[];
  pass: string[];
  multi?: boolean;
  answerKey?: string;
};
export type DropdownConfig = {
  options: string[];
  line: string;
  dir: "upto" | "from";
  answerKey?: string;
};
export type RangeConfig = {
  min?: number | null;
  max?: number | null;
  unit: string;
  answerKey?: string;
};

export type Criterion =
  | {
      id: string;
      type: "basic";
      label: string;
      kind: "choices";
      source: "form" | "resume";
      config: ChoicesConfig;
      required: boolean;
      weight: number;
    }
  | {
      id: string;
      type: "basic";
      label: string;
      kind: "dropdown";
      source: "form" | "resume";
      config: DropdownConfig;
      required: boolean;
      weight: number;
    }
  | {
      id: string;
      type: "basic";
      label: string;
      kind: "range";
      source: "form" | "resume";
      config: RangeConfig;
      required: boolean;
      weight: number;
    }
  | { id: string; type: "specialist"; label: string; required: boolean; weight: number };

export type Settings = {
  passLine: number;
  failLine: number;
  autoJudge: boolean;
  confirmRejections: boolean;
  weightMode: "equal" | "custom";
};

export type Match = "yes" | "partial" | "no" | "not_stated";

/** What the AI returned for one résumé-sourced or specialist criterion. */
export type AiCriterionResult = {
  criterionId: string;
  value: string | null;
  match: Match;
  evidence: string | null;
};

export type Flags = {
  injection?: boolean;
  unverifiedEvidence?: boolean;
  lowLegibility?: boolean;
  refusal?: boolean;
  invalidOutput?: boolean;
  noDocuments?: boolean;
  aiUnavailable?: boolean;
};

export type CriterionOutcome = {
  criterionId: string;
  label: string;
  type: "basic" | "specialist";
  required: boolean;
  weight: number;
  /** The value used: an entry answer or what the AI read from the documents. */
  value: string | null;
  /** Basic: met or not; null when the documents don't say. */
  met: boolean | null;
  /** Specialist: degree of match. */
  match: Match | null;
  points: number;
  evidence: string | null;
  evidenceVerified: boolean | null;
};

export type Decision = {
  verdict: Verdict;
  score: number | null;
  outcomes: CriterionOutcome[];
  /** Why the verdict is what it is, as codes for the UI (Screening.reasons.*). */
  reasons: string[];
  flags: Flags;
};

const MATCH_POINTS: Record<Match, number> = { yes: 1, partial: 0.5, no: 0, not_stated: 0 };

/** Points per criterion. Equal mode splits 100 as evenly as possible; custom uses each weight. */
export function weightsFor(
  criteria: Criterion[],
  mode: Settings["weightMode"],
): Map<string, number> {
  const weights = new Map<string, number>();
  if (mode === "custom") {
    for (const c of criteria) weights.set(c.id, c.weight);
    return weights;
  }
  const base = Math.floor(100 / Math.max(criteria.length, 1));
  let remainder = 100 - base * criteria.length;
  for (const c of criteria) {
    weights.set(c.id, base + (remainder > 0 ? 1 : 0));
    remainder--;
  }
  return weights;
}

export function weightsAreComplete(criteria: Criterion[], mode: Settings["weightMode"]): boolean {
  if (criteria.length === 0) return true;
  let total = 0;
  for (const weight of weightsFor(criteria, mode).values()) total += weight;
  return total === 100;
}

/** Whether a value satisfies a basic condition; null when there is no value to judge. */
export function evaluateBasic(
  criterion: Extract<Criterion, { type: "basic" }>,
  value: string | string[] | number | null | undefined,
): boolean | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return null;
  }
  switch (criterion.kind) {
    case "choices": {
      const chosen = Array.isArray(value) ? value.map(String) : [String(value)];
      return chosen.some((v) => criterion.config.pass.includes(v));
    }
    case "dropdown": {
      const options = criterion.config.options;
      const index = options.indexOf(String(value));
      const line = options.indexOf(criterion.config.line);
      if (index < 0 || line < 0) return null;
      return criterion.config.dir === "upto" ? index <= line : index >= line;
    }
    case "range": {
      const number =
        typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(number)) return null;
      const { min, max } = criterion.config;
      return (min == null || number >= min) && (max == null || number <= max);
    }
  }
}

function displayValue(value: string | string[] | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return Array.isArray(value) ? value.join("・") : String(value);
}

/**
 * The verdict for one application.
 * @param answers entry-page answers keyed by criterion id, or by the criterion's answerKey
 * @param ai results for résumé-sourced and specialist criteria (empty when no AI ran)
 * @param documentText transcripts the quotes must come from
 */
export function decide(input: {
  criteria: Criterion[];
  settings: Settings;
  answers: Record<string, string | string[] | number | null | undefined>;
  ai: AiCriterionResult[];
  documentText: string;
  flags: Flags;
}): Decision {
  const { criteria, settings, answers, ai, documentText } = input;
  const flags: Flags = { ...input.flags };
  const weights = weightsFor(criteria, settings.weightMode);
  const byId = new Map(ai.map((r) => [r.criterionId, r]));
  const outcomes: CriterionOutcome[] = [];

  for (const c of criteria) {
    const weight = weights.get(c.id) ?? 0;
    const result = byId.get(c.id);
    const evidence = result?.evidence?.trim() || null;
    const evidenceVerified = evidence ? quoteIsInText(evidence, documentText) : null;
    if (evidenceVerified === false) flags.unverifiedEvidence = true;

    if (c.type === "specialist") {
      const match = result?.match ?? "not_stated";
      outcomes.push({
        criterionId: c.id,
        label: c.label,
        type: c.type,
        required: c.required,
        weight,
        value: null,
        met: null,
        match,
        points: weight * MATCH_POINTS[match],
        evidence,
        evidenceVerified,
      });
      continue;
    }

    const raw = c.source === "form" ? answers[c.config.answerKey ?? c.id] : (result?.value ?? null);
    const met = evaluateBasic(c, raw);
    outcomes.push({
      criterionId: c.id,
      label: c.label,
      type: c.type,
      required: c.required,
      weight,
      value: displayValue(raw),
      met,
      match: null,
      points: met ? weight : 0,
      evidence: c.source === "resume" ? evidence : null,
      evidenceVerified: c.source === "resume" ? evidenceVerified : null,
    });
  }

  const weightsComplete = weightsAreComplete(criteria, settings.weightMode);
  const score =
    criteria.length > 0 && weightsComplete
      ? Math.round(outcomes.reduce((sum, o) => sum + o.points, 0))
      : null;
  const reasons: string[] = [];
  const reject: Verdict = settings.confirmRejections ? "fail_pending" : "fail";

  const safetyFlag =
    flags.noDocuments ||
    flags.injection ||
    flags.unverifiedEvidence ||
    flags.lowLegibility ||
    flags.refusal ||
    flags.invalidOutput ||
    flags.aiUnavailable;
  const requiredFailed = outcomes.some((o) => o.required && (o.met === false || o.match === "no"));
  const requiredUnknown = outcomes.some(
    (o) => o.required && ((o.type === "basic" && o.met === null) || o.match === "not_stated"),
  );
  const anyUnknown = outcomes.some((o) =>
    o.type === "basic" ? o.met === null : o.match === "not_stated",
  );

  let verdict: Verdict;
  if (!settings.autoJudge) {
    verdict = "check";
    reasons.push("autoJudgeOff");
  } else if (criteria.length === 0) {
    verdict = "check";
    reasons.push("noCriteria");
  } else if (!weightsComplete) {
    verdict = "check";
    reasons.push("weightsIncomplete");
  } else if (safetyFlag) {
    verdict = "check";
    if (flags.noDocuments) reasons.push("noDocuments");
    if (flags.injection) reasons.push("injection");
    if (flags.unverifiedEvidence) reasons.push("unverifiedEvidence");
    if (flags.lowLegibility) reasons.push("lowLegibility");
    if (flags.refusal || flags.invalidOutput) reasons.push("aiFailed");
    if (flags.aiUnavailable) reasons.push("aiUnavailable");
  } else if (requiredFailed) {
    verdict = reject;
    reasons.push("requiredFailed");
  } else if (requiredUnknown) {
    verdict = "check";
    reasons.push("requiredUnknown");
  } else if (score !== null && score >= settings.passLine) {
    verdict = "pass";
    reasons.push("aboveLine");
  } else if (anyUnknown) {
    // Never reject because something isn't written down.
    verdict = "check";
    reasons.push("notStated");
  } else if (score !== null && score < settings.failLine) {
    verdict = reject;
    reasons.push("belowLine");
  } else {
    verdict = "check";
    reasons.push("betweenLines");
  }
  return { verdict, score, outcomes, reasons, flags };
}

export const isPass = (v: Verdict) => v === "pass" || v === "manual_pass";
export const isFail = (v: Verdict) => v === "fail" || v === "manual_fail";
export const needsReview = (v: Verdict) => v === "check" || v === "manual_check";

// ----------------------------------------------------------------------------------------------
// Fairness guardrails (docs/02 M4-10)
// ----------------------------------------------------------------------------------------------

/** Topics that must not be screening criteria (MHLW 公正な採用選考, 職業安定法の指針). */
export const BANNED_TOPICS = [
  "本籍",
  "出生地",
  "出身地",
  "家族",
  "両親",
  "親の職業",
  "兄弟",
  "姉妹",
  "住宅状況",
  "持ち家",
  "生活環境",
  "家庭環境",
  "宗教",
  "信仰",
  "支持政党",
  "政党",
  "思想",
  "信条",
  "尊敬する人",
  "愛読",
  "労働組合",
  "学生運動",
  "社会運動",
  "性別",
  "男性",
  "女性",
  "婚姻",
  "結婚",
  "既婚",
  "未婚",
  "妊娠",
  "出産",
  "子供",
  "子ども",
  "国籍",
  "人種",
  "民族",
  "容姿",
  "身長",
  "体重",
  "写真",
  "健康状態",
  "病歴",
  "障害",
  "血液型",
  "星座",
] as const;

/** Exceptions that allow an age condition (労働施策総合推進法施行規則 1条の3 第1項). */
export const AGE_EXCEPTIONS = {
  "1": "定年年齢を上限として、それ未満の人を募集する（期間の定めのない雇用）",
  "2": "法令で年齢が制限されている業務（警備業の18歳未満など）",
  "3i": "長期のキャリア形成のため、若年者等を募集する（期間の定めのない雇用）",
  "3ro": "技能・ノウハウの継承のため、特定の職種で特定の年齢層を募集する",
  "3ha": "芸術・芸能の分野で、表現の真実性のために必要な場合",
  "3ni": "60歳以上の人、または国の雇用促進施策の対象年齢層に限って募集する",
} as const;

export type AgeException = keyof typeof AGE_EXCEPTIONS;

export type LabelCheck = { level: "blocked"; topic: string } | { level: "age" } | null;

/** Blocks banned topics in a condition's name or options; flags age conditions. */
export function checkCriterionText(...texts: string[]): LabelCheck {
  const compact = texts.join(" ").normalize("NFKC").replace(/\s/g, "");
  const topic = BANNED_TOPICS.find((t) => compact.includes(t));
  if (topic) return { level: "blocked", topic };
  if (/年齢|歳|才|生年|若手|年代/.test(compact)) return { level: "age" };
  return null;
}
