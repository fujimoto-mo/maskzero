// Pipeline stages and the candidate list's filter groups (docs/01 §5.6). Client-safe.

export const STAGES = [
  "applied",
  "screening",
  "booking",
  "scheduled",
  "interview",
  "evaluation",
  "offer",
  "hired",
] as const;
export type Stage = (typeof STAGES)[number];
export type Outcome = "active" | "rejected" | "withdrawn" | "hired";

export const STAGE_GROUPS = ["all", "screening", "interviewing", "passed", "closed"] as const;
export type StageGroup = (typeof STAGE_GROUPS)[number];
export const isStageGroup = (value: unknown): value is StageGroup =>
  typeof value === "string" && (STAGE_GROUPS as readonly string[]).includes(value);

export const GROUP_STAGES: Record<"screening" | "interviewing" | "passed", Stage[]> = {
  screening: ["applied", "screening"],
  interviewing: ["booking", "scheduled", "interview", "evaluation"],
  passed: ["offer", "hired"],
};

/** Manual moves until the interview workspace arrives (docs/02 M5-3). */
export const STAGE_CHANGES = [
  "next_round",
  "offer",
  "hired",
  "withdrawn",
  "rejected",
  "reopen",
] as const;
export type StageChange = (typeof STAGE_CHANGES)[number];

/** Which changes make sense from where the application is now. */
export function allowedChanges(stage: Stage, outcome: Outcome): StageChange[] {
  if (outcome !== "active") return outcome === "hired" ? [] : ["reopen"];
  const changes: StageChange[] = [];
  if (["booking", "scheduled", "interview", "evaluation"].includes(stage))
    changes.push("next_round");
  if (stage !== "offer" && stage !== "hired") changes.push("offer");
  if (stage === "offer") changes.push("hired");
  changes.push("withdrawn", "rejected");
  return changes;
}
