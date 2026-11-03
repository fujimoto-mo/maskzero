// Plans and their limits (docs/02 M13-4, M13-5). The numbers are provisional until pricing is
// decided; organizations.plan holds the id and is changed by mask0 staff, not in the app.

export type Limit = "clients" | "publishedJobs" | "aiUsdPerMonth";

export type Plan = {
  id: string;
  /** null = unlimited. */
  limits: Record<Limit, number | null>;
};

export const PLANS = {
  trial: { id: "trial", limits: { clients: 3, publishedJobs: 5, aiUsdPerMonth: 20 } },
  standard: { id: "standard", limits: { clients: 20, publishedJobs: 50, aiUsdPerMonth: 300 } },
  /** /demo sandboxes: enough AI for a visitor to try a few applications of their own. */
  demo: { id: "demo", limits: { clients: 3, publishedJobs: 4, aiUsdPerMonth: 1 } },
  enterprise: {
    id: "enterprise",
    limits: { clients: null, publishedJobs: null, aiUsdPerMonth: null },
  },
} as const satisfies Record<string, Plan>;

export type PlanId = keyof typeof PLANS;

/** An unknown id falls back to the trial plan, the most restrictive one. */
export const planFor = (id: string): Plan => PLANS[id as PlanId] ?? PLANS.trial;

/** True while `used` leaves room for one more under the limit. */
export const hasRoom = (limit: number | null, used: number) => limit === null || used < limit;
