import type { Verdict } from "./domain";

/**
 * Where a verdict leaves an application: its stage, whether it is still open, and who acts next.
 * Shared by the AI pipeline and staff decisions so both move applications the same way.
 */
export function stateForVerdict(verdict: Verdict) {
  switch (verdict) {
    case "pass":
    case "manual_pass":
      return {
        stage: "booking",
        outcome: "active",
        closeReason: null,
        // The interview invitation goes out with the pass (docs/02 M7-1).
        waitingOn: "candidate",
        nextAction: "await_booking",
      } as const;
    case "fail":
    case "manual_fail":
      return {
        outcome: "rejected",
        closeReason: "screening",
        waitingOn: null,
        nextAction: null,
      } as const;
    case "fail_pending":
      return {
        stage: "screening",
        outcome: "active",
        closeReason: null,
        waitingOn: "staff",
        nextAction: "confirm_rejection",
      } as const;
    default:
      return {
        stage: "screening",
        outcome: "active",
        closeReason: null,
        waitingOn: "staff",
        nextAction: "review_screening",
      } as const;
  }
}
