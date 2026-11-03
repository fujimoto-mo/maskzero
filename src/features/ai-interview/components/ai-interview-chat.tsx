"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type CandidateSessionView, MAX_ANSWER_CHARS } from "../domain";

type ErrorCode = "notOpen" | "expired" | "tooLong" | "empty" | "rateLimited" | "network";

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The AI interview on the personal page (docs/02 M12-2): intro and consent, chat, and the end. */
export function AiInterviewChat({
  token,
  company,
  deadline,
  initial,
}: {
  token: string;
  company: string;
  /** Formatted on the server, in Japan time. */
  deadline: string;
  initial: CandidateSessionView;
}) {
  const t = useTranslations("AiInterview");
  const [session, setSession] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session.status !== "started") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [session.status]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [session.turns.length, busy]);

  const remaining =
    now === null || !session.endsAt
      ? session.secondsLeft
      : Math.max(0, Math.round((new Date(session.endsAt).getTime() - now) / 1000));

  async function post(body: object): Promise<boolean> {
    setBusy(true);
    try {
      const response = await fetch(`/api/p/${token}/ai-interview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as {
        session?: CandidateSessionView | null;
        error?: ErrorCode;
      } | null;
      if (!response.ok || !data?.session) {
        toast.error(t(`errors.${data?.error ?? "network"}`));
        return false;
      }
      setSession(data.session);
      return true;
    } catch {
      toast.error(t("errors.network"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text) return void toast.error(t("errors.empty"));
    if (text.length > MAX_ANSWER_CHARS) return void toast.error(t("errors.tooLong"));
    if (await post({ action: "answer", text })) setDraft("");
  }

  const human = (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="h-auto justify-self-start p-0 text-muted-foreground">
          {t("human.button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("human.title")}</DialogTitle>
          <DialogDescription>{t("human.body")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("human.cancel")}</Button>
          </DialogClose>
          <Button disabled={busy} onClick={() => void post({ action: "human" })}>
            {t("human.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (session.status === "invited") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("intro.title")}</CardTitle>
          <CardDescription>{t("intro.lead", { company })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <ul className="grid list-disc gap-1.5 pl-5">
            <li>{t("intro.questions", { count: session.questionCount })}</li>
            <li>{t("intro.time", { minutes: session.timeLimitMinutes })}</li>
            <li>{t("intro.deadline", { deadline })}</li>
          </ul>
          <div className="grid gap-1.5 rounded-md bg-muted/60 p-3">
            <h2 className="font-medium">{t("intro.aboutTitle")}</h2>
            <p>{t("intro.about")}</p>
            <p>{t("intro.fairness")}</p>
            <p>{t("intro.data")}</p>
          </div>
          <p className="text-muted-foreground">{t("intro.humanNote")}</p>
          <div className="flex items-start gap-2">
            <Checkbox
              id="ai-consent"
              checked={consent}
              onCheckedChange={(value) => setConsent(value === true)}
            />
            <Label htmlFor="ai-consent" className="leading-snug font-normal">
              {t("intro.consent")}
            </Label>
          </div>
          <Button
            disabled={!consent || busy}
            onClick={() => void post({ action: "start", consent: true })}
          >
            {t("intro.start")}
          </Button>
          {human}
        </CardContent>
      </Card>
    );
  }

  if (session.status === "started") {
    const timeUp = remaining === 0;
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">
            {t("chat.progress", {
              current: Math.min(session.currentQuestion + 1, session.questionCount),
              count: session.questionCount,
            })}
          </CardTitle>
          <span
            className={cn(
              "text-sm tabular-nums",
              remaining < 300 && "font-medium text-destructive",
            )}
            aria-live={remaining < 60 ? "polite" : "off"}
          >
            {t("chat.remaining", { time: clock(remaining) })}
          </span>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ol className="grid gap-3" aria-label={t("chat.label")}>
            {session.turns.map((turn, i) => (
              <li
                key={i}
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                  turn.role === "ai"
                    ? "justify-self-start bg-muted"
                    : "justify-self-end bg-primary text-primary-foreground",
                )}
              >
                <span className="sr-only">
                  {turn.role === "ai" ? t("chat.interviewer") : t("chat.you")}：
                </span>
                {turn.text}
              </li>
            ))}
            {busy ? (
              <li className="justify-self-start text-xs text-muted-foreground">
                {t("chat.thinking")}
              </li>
            ) : null}
          </ol>
          <div ref={endRef} />
          <div className="grid gap-2">
            {timeUp ? <p className="text-sm text-destructive">{t("chat.timeUp")}</p> : null}
            <Label htmlFor="ai-answer" className="sr-only">
              {t("chat.answerLabel")}
            </Label>
            <Textarea
              id="ai-answer"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("chat.placeholder")}
              rows={5}
              disabled={busy}
            />
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-xs text-muted-foreground tabular-nums",
                  draft.length > MAX_ANSWER_CHARS && "text-destructive",
                )}
              >
                {t("chat.count", { count: draft.length, max: MAX_ANSWER_CHARS })}
              </span>
              <Button disabled={busy || !draft.trim()} onClick={() => void send()}>
                {busy ? t("chat.sending") : t("chat.send")}
              </Button>
            </div>
          </div>
          {human}
        </CardContent>
      </Card>
    );
  }

  const done =
    session.status === "aborted"
      ? session.humanRequested
        ? "human"
        : "closed"
      : session.status === "expired"
        ? "expired"
        : "thanks";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`done.${done}.title`)}</CardTitle>
        <CardDescription>{t(`done.${done}.body`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {done === "human" ? (
          <Button asChild>
            {/* A full load: the booking page reads the new invitation on the server. */}
            <a href={`/p/${token}/book`}>{t("done.human.book")}</a>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <a href={`/p/${token}`}>{t("back")}</a>
        </Button>
      </CardContent>
    </Card>
  );
}
