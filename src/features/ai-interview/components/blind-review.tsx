"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type BlindComparison, saveBlindReviewAction } from "../actions";
import type { Question, Turn } from "../domain";

const SCALE = [1, 2, 3, 4, 5] as const;

/**
 * Rate an AI interview without seeing the AI's scores or the candidate's name (P5 WP3); the
 * comparison appears once the rating is saved.
 */
export function BlindReview({
  orgSlug,
  clientSlug,
  item,
}: {
  orgSlug: string;
  clientSlug: string;
  item: { sessionId: string; jobTitle: string; questions: Question[]; turns: Turn[] };
}) {
  const t = useTranslations("AiReview.blind");
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comparison, setComparison] = useState<BlindComparison | null>(null);
  const [pending, startTransition] = useTransition();
  const complete = item.questions.every((q) => scores[q.id]);

  function save() {
    startTransition(async () => {
      const result = await saveBlindReviewAction(orgSlug, clientSlug, {
        sessionId: item.sessionId,
        scores,
      });
      if (!result.ok) return void toast.error(t("failed"));
      setComparison(result.comparison);
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{t("job", { job: item.jobTitle })}</p>
      {item.questions.map((q, index) => {
        const exchange = item.turns.filter((x) => x.questionId === q.id && x.kind !== "closing");
        return (
          <Card key={q.id}>
            <CardHeader>
              <CardDescription>{t("question", { n: index + 1 })}</CardDescription>
              <CardTitle className="text-base leading-snug">{q.text}</CardTitle>
              {q.rubric ? (
                <p className="text-xs text-muted-foreground">{t("rubric", { rubric: q.rubric })}</p>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {exchange.some((x) => x.role === "candidate") ? (
                <ol className="grid gap-2">
                  {exchange
                    .filter((x) => x.kind !== "question")
                    .map((turn, i) => (
                      <li key={i} className="grid gap-0.5">
                        <span className="text-xs text-muted-foreground">
                          {turn.role === "ai" ? t("followUp") : t("answer")}
                        </span>
                        <p className="whitespace-pre-wrap">{turn.text}</p>
                      </li>
                    ))}
                </ol>
              ) : (
                <p className="text-muted-foreground">{t("noAnswer")}</p>
              )}
              <fieldset disabled={Boolean(comparison)} className="grid gap-1.5">
                <legend className="mb-1 text-xs font-medium">{t("yourScore")}</legend>
                <div className="flex flex-wrap gap-1.5" role="radiogroup">
                  {SCALE.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={scores[q.id] === n}
                      variant={scores[q.id] === n ? "default" : "outline"}
                      className="w-10 tabular-nums"
                      onClick={() => setScores((s) => ({ ...s, [q.id]: n }))}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                {comparison ? (
                  <p
                    className={cn(
                      "text-xs",
                      comparison.ai.scores[q.id] === scores[q.id]
                        ? "text-muted-foreground"
                        : "font-medium",
                    )}
                  >
                    {t("aiScore", { score: comparison.ai.scores[q.id] ?? "—" })}
                  </p>
                ) : null}
              </fieldset>
            </CardContent>
          </Card>
        );
      })}

      {comparison ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {comparison.ai.band === comparison.mine.band ? t("agree") : t("disagree")}
            </CardTitle>
            <CardDescription>
              {t("compare", {
                mine: comparison.mine.band,
                mineAverage: comparison.mine.average.toFixed(2),
                ai: comparison.ai.band,
                aiTotal: comparison.ai.total.toFixed(2),
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.refresh()}>{t("next")}</Button>
          </CardContent>
        </Card>
      ) : (
        <Button className="justify-self-start" disabled={!complete || pending} onClick={save}>
          {pending ? t("saving") : t("save")}
        </Button>
      )}
    </div>
  );
}
