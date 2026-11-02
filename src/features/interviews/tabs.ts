// Tabs of the "to interview" list, shared by the page and its client view.

export const INTERVIEW_TABS = ["action", "scheduled", "all"] as const;
export type InterviewTab = (typeof INTERVIEW_TABS)[number];
export const isInterviewTab = (v: unknown): v is InterviewTab =>
  typeof v === "string" && (INTERVIEW_TABS as readonly string[]).includes(v);
