"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AssistSuggestion } from "../live";
import { pollLiveAction } from "../live-actions";
import type { LiveView } from "../live-server";

type Segment = LiveView["segments"][number];

const POLL_MS = 3000;

const clock = (at: number | null) =>
  at === null
    ? ""
    : `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(Math.floor(at % 60)).padStart(2, "0")}`;

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Tokyo",
});

/** The rolling transcript and the AI's suggestions while the interview runs (docs/02 M11-7). */
export function LiveAssistView({
  target,
  initial,
}: {
  target: { orgSlug: string; clientSlug: string; interviewId: string };
  initial: LiveView;
}) {
  const t = useTranslations("Workspace.live");
  const [segments, setSegments] = useState<Segment[]>(initial.segments);
  const [suggestions, setSuggestions] = useState<AssistSuggestion[]>(initial.suggestions);
  const [suggestionsAt, setSuggestionsAt] = useState(initial.suggestionsAt);
  const [finished, setFinished] = useState(initial.finished);
  const lastId = useRef<string | null>(initial.segments.at(-1)?.id ?? null);
  const bottom = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (finished) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const view = await pollLiveAction(
          target.orgSlug,
          target.clientSlug,
          target.interviewId,
          lastId.current,
        );
        if (stopped || !view) return;
        if (view.segments.length) {
          lastId.current = view.segments.at(-1)!.id;
          setSegments((all) => [...all, ...view.segments]);
        }
        setSuggestions(view.suggestions);
        setSuggestionsAt(view.suggestionsAt);
        if (view.finished) {
          setFinished(true);
          return;
        }
      } catch {
        // A missed poll is caught up by the next one.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [finished, target.orgSlug, target.clientSlug, target.interviewId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [segments.length]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card className="min-h-[24rem]">
        <CardHeader>
          <CardTitle>{t("transcript")}</CardTitle>
          {finished ? <CardDescription>{t("finished")}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          {segments.length === 0 && !finished ? (
            <p className="text-sm text-muted-foreground">{t("waiting")}</p>
          ) : (
            <ol className="grid max-h-[60vh] gap-3 overflow-y-auto pr-2" aria-live="polite">
              {segments.map((s) => (
                <li key={s.id} className="grid gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {clock(s.at)} {s.speaker ?? t("speaker")}
                  </span>
                  <span className="text-sm leading-relaxed">{s.text}</span>
                </li>
              ))}
              <li ref={bottom} aria-hidden className="h-0" />
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("suggestions")}</CardTitle>
          {suggestionsAt ? (
            <CardDescription>
              {t("updatedAt", { time: timeFormat.format(new Date(suggestionsAt)) })}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noSuggestions")}</p>
          ) : (
            <ul className="grid gap-4">
              {suggestions.map((s, i) => (
                <li key={`${suggestionsAt}-${i}`} className="grid gap-1.5 rounded-lg border p-3">
                  <Badge variant="secondary" className="justify-self-start">
                    {t(`kinds.${s.kind}`)}
                  </Badge>
                  <p className="text-sm font-medium">{s.question}</p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
