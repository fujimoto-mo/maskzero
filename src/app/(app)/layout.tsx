import type { ReactNode } from "react";

// The staff app reads the session and membership for every page, so it renders per request and
// blocks instead of streaming from a prerendered shell. Moving session reads behind <Suspense> to
// make navigations instant is a later optimization (see CLAUDE.md, "Cache Components").
export const instant = false;

export default function StaffAppLayout({ children }: { children: ReactNode }) {
  return children;
}
