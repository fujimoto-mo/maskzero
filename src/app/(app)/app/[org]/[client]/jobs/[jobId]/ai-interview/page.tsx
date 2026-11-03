import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AiConfigEditor } from "@/features/ai-interview/components/config-editor";
import { AI_FEATURE } from "@/features/ai-interview/domain";
import { getAiConfig } from "@/features/ai-interview/queries";
import { isUuid } from "@/lib/utils";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "AI面接の設定" };

/** A job's AI interview settings (docs/02 M12-1), where the feature is on. */
export default async function JobAiInterviewPage({
  params,
}: PageProps<"/app/[org]/[client]/jobs/[jobId]/ai-interview">) {
  const { org, client, jobId } = await params;
  const ctx = await requireMember(org, client);
  if (!ctx.featureFlags.includes(AI_FEATURE) || ctx.role === "interviewer" || !isUuid(jobId)) {
    notFound();
  }
  const [t, data] = await Promise.all([
    getTranslations("AiReview.config"),
    getAiConfig(ctx, jobId),
  ]);
  if (!data) notFound();

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={`/app/${ctx.orgSlug}/${ctx.clientSlug}/jobs/${jobId}`}>
            <ChevronLeftIcon aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{t("pageTitle")}</h1>
          <p className="truncate text-sm text-muted-foreground">{data.jobTitle}</p>
        </div>
      </div>
      <AiConfigEditor
        orgSlug={ctx.orgSlug}
        clientSlug={ctx.clientSlug}
        jobId={jobId}
        initial={
          data.config ?? { enabled: false, questions: [], timeLimitMinutes: 30, deadlineDays: 7 }
        }
        canEdit={canEdit(ctx)}
      />
    </div>
  );
}
