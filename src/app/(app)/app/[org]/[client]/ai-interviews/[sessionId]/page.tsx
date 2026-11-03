import { CheckIcon, ChevronLeftIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionActions } from "@/features/ai-interview/components/session-actions";
import { AI_FEATURE } from "@/features/ai-interview/domain";
import { getAiSessionDetail } from "@/features/ai-interview/queries";
import { isUuid } from "@/lib/utils";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "AI面接の結果" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * One AI interview for people to review (docs/02 M12-3, M12-4): the conversation, the AI's
 * proposed scores with their evidence, and the ways forward. The decision itself is taken on the
 * candidate, like any other.
 */
export default async function AiInterviewDetailPage({
  params,
}: PageProps<"/app/[org]/[client]/ai-interviews/[sessionId]">) {
  const { org, client, sessionId } = await params;
  const ctx = await requireMember(org, client);
  if (!ctx.featureFlags.includes(AI_FEATURE) || ctx.role === "interviewer" || !isUuid(sessionId)) {
    notFound();
  }
  const [t, s] = await Promise.all([
    getTranslations("AiReview"),
    getAiSessionDetail(ctx, sessionId),
  ]);
  if (!s) notFound();
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;
  const scored = s.status === "scored";
  const flags = (
    [
      ["humanRequested", s.flags.humanRequested],
      ["partial", s.flags.partial],
      ["injection", s.flags.injection],
      ["scoringFailed", s.flags.scoringFailed],
    ] as const
  ).filter(([, on]) => on);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={`${base}/ai-interviews`}>
            <ChevronLeftIcon aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold">{s.candidateName}</h1>
          <p className="truncate text-sm text-muted-foreground">{s.jobTitle}</p>
        </div>
        <Badge variant="outline">{t(`status.${s.status}`)}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>{t("detail.result")}</CardDescription>
          <CardTitle className="text-3xl tabular-nums">
            {scored && s.band ? `${s.band}（${s.total?.toFixed(2)} / 5）` : "—"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {s.summary ? <p>{s.summary}</p> : null}
          <p className="text-xs text-muted-foreground">{t("detail.aiNote")}</p>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t("detail.deadline")}</dt>
            <dd>{dateFormat.format(new Date(s.deadlineAt))}</dd>
            {s.startedAt ? (
              <>
                <dt className="text-muted-foreground">{t("detail.started")}</dt>
                <dd>{dateFormat.format(new Date(s.startedAt))}</dd>
              </>
            ) : null}
            {s.completedAt ? (
              <>
                <dt className="text-muted-foreground">{t("detail.completed")}</dt>
                <dd>{dateFormat.format(new Date(s.completedAt))}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">{t("detail.attempt")}</dt>
            <dd>{s.attempt}</dd>
            <dt className="text-muted-foreground">{t("detail.reviews")}</dt>
            <dd>{s.reviewCount}</dd>
          </dl>
          {flags.length > 0 ? (
            <Alert>
              <TriangleAlertIcon aria-hidden />
              <AlertDescription>
                <ul className="grid gap-0.5">
                  {flags.map(([key]) => (
                    <li key={key}>{t(`flagNotes.${key}`)}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <Link href={`${base}/candidates?app=${s.applicationId}`}>{t("detail.decide")}</Link>
            </Button>
            {canEdit(ctx) && s.outcome === "active" ? (
              <SessionActions
                orgSlug={ctx.orgSlug}
                clientSlug={ctx.clientSlug}
                sessionId={s.id}
                canReinvite={s.status === "expired" && s.attempt === 1}
                canInviteHuman={
                  !s.humanInvited &&
                  (s.status === "expired" ||
                    (s.status === "completed" && Boolean(s.flags.scoringFailed)))
                }
                canRescore={s.status === "completed" && Boolean(s.flags.scoringFailed)}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {s.questions.map((q, index) => {
        const exchange = s.turns.filter(
          (turn) => turn.questionId === q.id && turn.kind !== "closing",
        );
        const score = scored ? s.scores?.find((x) => x.questionId === q.id) : undefined;
        return (
          <Card key={q.id}>
            <CardHeader>
              <CardDescription>{t("detail.question", { n: index + 1 })}</CardDescription>
              <CardTitle className="text-base leading-snug">{q.text}</CardTitle>
              {q.rubric ? (
                <p className="text-xs text-muted-foreground">
                  {t("detail.rubric", { rubric: q.rubric })}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {!exchange.some((x) => x.role === "candidate") ? (
                <p className="text-muted-foreground">{t("detail.noAnswer")}</p>
              ) : (
                <ol className="grid gap-2">
                  {exchange
                    .filter((turn) => turn.kind !== "question")
                    .map((turn, i) => (
                      <li key={i} className="grid gap-0.5">
                        <span className="text-xs text-muted-foreground">
                          {turn.role === "ai" ? t("detail.followUp") : t("detail.answer")}
                        </span>
                        <p className="whitespace-pre-wrap">{turn.text}</p>
                      </li>
                    ))}
                </ol>
              )}
              {score ? (
                <div className="grid gap-2 rounded-md bg-muted/60 p-3">
                  <p className="font-medium tabular-nums">
                    {t("detail.score", { score: score.score })}
                  </p>
                  {score.comment ? <p>{score.comment}</p> : null}
                  {score.evidence.length > 0 ? (
                    <ul className="grid gap-1 text-xs">
                      {score.evidence.map((e, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          {e.verified ? (
                            <CheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          ) : (
                            <TriangleAlertIcon
                              className="mt-0.5 size-3.5 shrink-0 text-destructive"
                              aria-hidden
                            />
                          )}
                          <span>
                            「{e.quote}」
                            {e.verified ? null : (
                              <span className="text-destructive">{t("detail.unverified")}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
