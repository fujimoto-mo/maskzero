import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { clientMessages } from "@/i18n/client-messages";

// The staff app reads the session and membership for every page, so it renders per request and
// blocks instead of streaming from a prerendered shell. Moving session reads behind <Suspense> to
// make navigations instant is a later optimization (see CLAUDE.md, "Cache Components").
export const instant = false;

export default async function StaffAppLayout({ children }: { children: ReactNode }) {
  const messages = await clientMessages(
    "Common",
    "App",
    "Jobs",
    "Intake",
    "Entry",
    "Screening",
    "Criteria",
    "Candidates",
    "Settings",
    "Scheduling",
    "Interviews",
    "Clients",
    "Waiting",
    "Messages",
    "Pool",
    "Workspace",
    "AiReview",
  );
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
