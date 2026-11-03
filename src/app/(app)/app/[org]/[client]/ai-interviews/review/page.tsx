import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BlindReview } from "@/features/ai-interview/components/blind-review";
import { AI_FEATURE } from "@/features/ai-interview/domain";
import { nextBlindItem } from "@/features/ai-interview/queries";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "AI面接のブラインド評価" };

/**
 * Blind review (P5 WP3): recruiters rate scored interviews without the AI's scores or the
 * candidate's name, which measures how often people and the AI agree.
 */
export default async function BlindReviewPage({
  params,
}: PageProps<"/app/[org]/[client]/ai-interviews/review">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  if (!ctx.featureFlags.includes(AI_FEATURE) || !canEdit(ctx)) notFound();
  const [t, item] = await Promise.all([getTranslations("AiReview.blind"), nextBlindItem(ctx)]);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={`/app/${ctx.orgSlug}/${ctx.clientSlug}/ai-interviews`}>
            <ChevronLeftIcon aria-hidden />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>
      {item ? (
        <BlindReview
          key={item.sessionId}
          orgSlug={ctx.orgSlug}
          clientSlug={ctx.clientSlug}
          item={item}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("done")}</p>
      )}
    </div>
  );
}
