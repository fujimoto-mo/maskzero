import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InterviewsView } from "@/features/interviews/components/interviews-view";
import { listInvitations } from "@/features/interviews/queries";
import { isInterviewTab } from "@/features/interviews/tabs";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "面接予定者" };

export default async function InterviewsPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/interviews">) {
  const [{ org, client }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  const tab = isInterviewTab(query.tab) ? query.tab : "action";
  const [t, rows] = await Promise.all([
    getTranslations("Interviews"),
    listInvitations(ctx, tab, new Date()),
  ]);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <InterviewsView
        base={`/app/${ctx.orgSlug}/${ctx.clientSlug}`}
        tab={tab}
        rows={rows}
        canEdit={canEdit(ctx)}
      />
    </div>
  );
}
