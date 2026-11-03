"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PrepQuestion } from "@/server/db/schema/interviewing";
import { averageScore, formatTime, RUBRIC, SCORE_MAX, SCORE_MIN } from "../rubric";
import {
  assignInterviewersAction,
  decideAction,
  generateQuestionsAction,
  requestReportAction,
  saveEvaluationAction,
  savePurposeAction,
  saveQuestionsAction,
  undoDecisionAction,
  uploadTranscriptAction,
} from "../workspace-actions";
import type { Workspace } from "../workspace";

type Target = { orgSlug: string; clientSlug: string; interviewId: string };

// -------------------------------------------------------------------------------------------------
// Interviewers
// -------------------------------------------------------------------------------------------------

export function Interviewers({
  target,
  names,
  ids,
  members,
}: {
  target: Target;
  names: string[];
  ids: string[];
  members: Workspace["members"];
}) {
  const t = useTranslations("Workspace");
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string[]>(ids);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("interviewers")}：</span>
      <span>{names.length ? names.join("、") : t("unassigned")}</span>
      {members.length > 0 ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {t("assign")}
        </Button>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("assignTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            {members.map((m) => (
              <Label key={m.id} htmlFor={`iv-${m.id}`} className="font-normal">
                <Checkbox
                  id={`iv-${m.id}`}
                  checked={chosen.includes(m.id)}
                  onCheckedChange={(on) =>
                    setChosen((now) => (on ? [...now, m.id] : now.filter((x) => x !== m.id)))
                  }
                />
                {m.name}
              </Label>
            ))}
            <p className="text-xs text-muted-foreground">{t("assignHint")}</p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await assignInterviewersAction(
                    target.orgSlug,
                    target.clientSlug,
                    target.interviewId,
                    chosen,
                  );
                  if (result.ok) {
                    toast.success(t("saved"));
                    setOpen(false);
                  }
                })
              }
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Prep (M11-2)
// -------------------------------------------------------------------------------------------------

const GROUPS: PrepQuestion["group"][] = ["experience", "consistency", "motivation", "own"];

export function PrepTab({
  target,
  workspace,
  canEditPurpose,
  canWork,
}: {
  target: Target;
  workspace: Workspace;
  canEditPurpose: boolean;
  /** Editors and this interview's interviewers; viewers only read and print. */
  canWork: boolean;
}) {
  const t = useTranslations("Workspace");
  const { highlights } = workspace;
  const [purpose, setPurpose] = useState(workspace.interview.purpose ?? "");
  const [items, setItems] = useState<PrepQuestion[]>(workspace.questions.items);
  const [mode, setMode] = useState(workspace.questions.mode);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(items) !== JSON.stringify(workspace.questions.items);

  const move = (index: number, by: number) =>
    setItems((now) => {
      const next = [...now];
      const [item] = next.splice(index, 1);
      next.splice(Math.max(0, Math.min(next.length, index + by)), 0, item!);
      return next;
    });
  const update = (id: string, patch: Partial<PrepQuestion>) =>
    setItems((now) => now.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="grid content-start gap-6 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle>{t("highlights")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {highlights.screening.length > 0 ? (
              <ul className="grid gap-2">
                {highlights.screening.map((s) => (
                  <li key={s.label}>
                    <span className="font-medium">{s.label}</span>
                    <Badge variant="outline" className="ml-2">
                      {t(`results.${s.result}`)}
                    </Badge>
                    {s.evidence ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">「{s.evidence}」</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t("noScreening")}</p>
            )}
            {highlights.workHistory.length > 0 ? (
              <div>
                <p className="font-medium">{t("workHistory")}</p>
                <ul className="mt-1 grid gap-1">
                  {highlights.workHistory.map((w, i) => (
                    <li key={i} className="text-xs">
                      {w.period}　{w.company}　{w.role}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {highlights.licences.length + highlights.skills.length > 0 ? (
              <p className="text-xs">
                <span className="font-medium">{t("skills")}：</span>
                {[...highlights.licences, ...highlights.skills].join("、")}
              </p>
            ) : null}
            {highlights.motivation ? (
              <p className="text-xs">
                <span className="font-medium">{t("motivation")}：</span>
                {highlights.motivation}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("purpose")}</CardTitle>
            <CardDescription>{t("purposeHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor="purpose" className="sr-only">
              {t("purpose")}
            </Label>
            <Textarea
              id="purpose"
              rows={3}
              maxLength={1000}
              value={purpose}
              readOnly={!canEditPurpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
            {canEditPurpose ? (
              <Button
                variant="outline"
                size="sm"
                className="justify-self-start"
                disabled={pending || purpose === (workspace.interview.purpose ?? "")}
                onClick={() =>
                  startTransition(async () => {
                    await savePurposeAction(
                      target.orgSlug,
                      target.clientSlug,
                      target.interviewId,
                      purpose,
                    );
                    toast.success(t("saved"));
                  })
                }
              >
                {t("save")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader>
          <CardTitle>{t("questions")}</CardTitle>
          <CardDescription className="print:hidden">{t("questionsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <div className={canWork ? "grid gap-1" : "hidden"}>
              <Label htmlFor="q-mode" className="text-xs">
                {t("mode")}
              </Label>
              <NativeSelect
                id="q-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as "standard" | "deep")}
                className="w-36"
              >
                <option value="standard">{t("modes.standard")}</option>
                <option value="deep">{t("modes.deep")}</option>
              </NativeSelect>
            </div>
            <Button
              className={canWork ? undefined : "hidden"}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await generateQuestionsAction(
                    target.orgSlug,
                    target.clientSlug,
                    target.interviewId,
                    mode,
                  );
                  if (result.ok) toast.success(t("generated"));
                  else toast.error(t(`errors.${result.error}`));
                })
              }
            >
              {workspace.questions.generated ? t("regenerate") : t("generate")}
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <PrinterIcon aria-hidden />
              {t("print")}
            </Button>
          </div>
          {pending ? (
            <p className="text-sm text-muted-foreground print:hidden">{t("working")}</p>
          ) : null}

          {GROUPS.map((group) => {
            const inGroup = items.filter((q) => q.group === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group} className="grid gap-2">
                <h3 className="text-sm font-semibold">{t(`groups.${group}`)}</h3>
                <ol className="grid gap-2">
                  {inGroup.map((q) => {
                    const index = items.indexOf(q);
                    return (
                      <li
                        key={q.id}
                        className={`grid gap-1 rounded-lg border p-2 ${q.picked ? "" : "opacity-60 print:hidden"}`}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            className="mt-2 print:hidden"
                            checked={q.picked}
                            aria-label={t("pick")}
                            onCheckedChange={(on) => update(q.id, { picked: on === true })}
                          />
                          <Input
                            value={q.text}
                            maxLength={300}
                            aria-label={t("questionText")}
                            onChange={(e) => update(q.id, { text: e.target.value })}
                            className="flex-1 print:border-0 print:p-0"
                          />
                          <div className="flex print:hidden">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("up")}
                              disabled={index === 0}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowUpIcon aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("down")}
                              disabled={index === items.length - 1}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowDownIcon aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t("remove")}
                              onClick={() => setItems((now) => now.filter((x) => x.id !== q.id))}
                            >
                              <Trash2Icon aria-hidden />
                            </Button>
                          </div>
                        </div>
                        {q.why ? (
                          <p className="pl-7 text-xs text-muted-foreground print:hidden">{q.why}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noQuestions")}</p>
          ) : null}

          <div className={canWork ? "flex flex-wrap items-center gap-2 print:hidden" : "hidden"}>
            <Label htmlFor="own-question" className="sr-only">
              {t("addOwn")}
            </Label>
            <Input
              id="own-question"
              value={draft}
              maxLength={300}
              placeholder={t("addOwnPlaceholder")}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1"
            />
            <Button
              variant="outline"
              disabled={!draft.trim()}
              onClick={() => {
                setItems((now) => [
                  ...now,
                  {
                    id: crypto.randomUUID(),
                    group: "own",
                    text: draft.trim(),
                    why: "",
                    picked: true,
                  },
                ]);
                setDraft("");
              }}
            >
              <PlusIcon aria-hidden />
              {t("addOwn")}
            </Button>
          </div>
          <Button
            className={canWork ? "justify-self-start print:hidden" : "hidden"}
            disabled={pending || !dirty || items.some((q) => !q.text.trim())}
            onClick={() =>
              startTransition(async () => {
                const result = await saveQuestionsAction(
                  target.orgSlug,
                  target.clientSlug,
                  target.interviewId,
                  items,
                );
                if (result.ok) toast.success(t("saved"));
              })
            }
          >
            {t("saveQuestions")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------------------------------------------------------------------------------------
// Evaluation and decision (M11-3, M11-4)
// -------------------------------------------------------------------------------------------------

export function EvaluationTab({
  target,
  workspace,
  selfId,
  canEvaluate,
  canDecide,
}: {
  target: Target;
  workspace: Workspace;
  selfId: string;
  canEvaluate: boolean;
  canDecide: boolean;
}) {
  const t = useTranslations("Workspace");
  const mine = workspace.evaluations.find((e) => e.authorId === selfId);
  const others = workspace.evaluations.filter((e) => e.authorId !== selfId);
  const [scores, setScores] = useState<Record<string, number>>(mine?.scores ?? {});
  const [comments, setComments] = useState<Record<string, string>>(mine?.comments ?? {});
  const [notes, setNotes] = useState(mine?.notes ?? "");
  const [recommendation, setRecommendation] = useState(mine?.recommendation ?? null);
  const [pending, startTransition] = useTransition();
  const average = averageScore(scores);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{t("myEvaluation")}</CardTitle>
          <CardDescription>{t("evaluationHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {RUBRIC.map((c) => (
            <fieldset key={c.id} className="grid gap-2" disabled={!canEvaluate}>
              <legend className="text-sm font-medium">{c.label}</legend>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={c.label}>
                {Array.from({ length: SCORE_MAX - SCORE_MIN + 1 }, (_, i) => i + SCORE_MIN).map(
                  (n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      role="radio"
                      aria-checked={scores[c.id] === n}
                      aria-label={t("scoreOf", { criterion: c.label, score: n })}
                      variant={scores[c.id] === n ? "default" : "outline"}
                      onClick={() => setScores((now) => ({ ...now, [c.id]: n }))}
                    >
                      {n}
                    </Button>
                  ),
                )}
              </div>
              <Input
                value={comments[c.id] ?? ""}
                maxLength={1000}
                placeholder={t("commentPlaceholder")}
                aria-label={t("commentFor", { criterion: c.label })}
                onChange={(e) => setComments((now) => ({ ...now, [c.id]: e.target.value }))}
              />
            </fieldset>
          ))}
          <div className="grid gap-1.5">
            <Label htmlFor="eval-notes">{t("notes")}</Label>
            <Textarea
              id="eval-notes"
              rows={6}
              maxLength={5000}
              value={notes}
              disabled={!canEvaluate}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="eval-recommendation">{t("recommendation")}</Label>
            <NativeSelect
              id="eval-recommendation"
              value={recommendation ?? ""}
              disabled={!canEvaluate}
              onChange={(e) => setRecommendation((e.target.value || null) as typeof recommendation)}
              className="w-48"
            >
              <option value="">{t("noRecommendation")}</option>
              <option value="advance">{t("recommendations.advance")}</option>
              <option value="hold">{t("recommendations.hold")}</option>
              <option value="decline">{t("recommendations.decline")}</option>
            </NativeSelect>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={!canEvaluate || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveEvaluationAction(
                    target.orgSlug,
                    target.clientSlug,
                    target.interviewId,
                    { scores, comments, notes, recommendation },
                  );
                  if (result.ok) toast.success(t("saved"));
                })
              }
            >
              {t("saveEvaluation")}
            </Button>
            {average !== null ? (
              <span className="text-sm text-muted-foreground">
                {t("average", { score: average.toFixed(1) })}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid content-start gap-6">
        {canDecide ? <DecisionPanel target={target} workspace={workspace} /> : null}
        <Card>
          <CardHeader>
            <CardTitle>{t("othersTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {others.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noOthers")}</p>
            ) : (
              <ul className="grid gap-3 text-sm">
                {others.map((e) => (
                  <li key={e.authorId} className="grid gap-1">
                    <p className="font-medium">
                      {e.authorName}
                      {e.average !== null
                        ? `（${t("average", { score: e.average.toFixed(1) })}）`
                        : ""}
                      {e.recommendation ? (
                        <Badge variant="outline" className="ml-2">
                          {t(`recommendations.${e.recommendation}`)}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {RUBRIC.map((c) => `${c.label} ${e.scores[c.id] ?? "—"}`).join("・")}
                    </p>
                    {e.notes ? <p className="text-xs whitespace-pre-wrap">{e.notes}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const DECISIONS = ["pass", "next_round", "fail", "withdrawn"] as const;

function DecisionPanel({ target, workspace }: { target: Target; workspace: Workspace }) {
  const t = useTranslations("Workspace");
  const router = useRouter();
  const [confirming, setConfirming] = useState<(typeof DECISIONS)[number] | null>(null);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const decision = workspace.decision;
  const remaining = decision ? Date.parse(decision.effectiveAt) - now : 0;

  useEffect(() => {
    if (!decision || remaining <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [decision, remaining]);

  const closed = workspace.outcome !== "active" && !decision;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("decision")}</CardTitle>
        <CardDescription>{t("decisionHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {decision ? (
          <>
            <p className="text-sm">
              {t("decided", {
                decision: t(`decisions.${decision.decision}`),
                by: decision.decidedBy,
              })}
            </p>
            {remaining > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {t("undoLeft", {
                    minutes: Math.floor(remaining / 60000),
                    seconds: String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0"),
                  })}
                </span>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await undoDecisionAction(
                        target.orgSlug,
                        target.clientSlug,
                        decision.id,
                      );
                      if (result.ok) {
                        toast.success(t("undone"));
                        router.refresh();
                      } else toast.error(t("undoTooLate"));
                    })
                  }
                >
                  {t("undo")}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t("final")}</p>
            )}
          </>
        ) : closed ? (
          <p className="text-sm text-muted-foreground">{t("closedApplication")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {DECISIONS.map((d) => (
              <Button
                key={d}
                variant={d === "fail" || d === "withdrawn" ? "outline" : "default"}
                disabled={pending}
                onClick={() => setConfirming(d)}
              >
                {t(`decisions.${d}`)}
              </Button>
            ))}
          </div>
        )}
        <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirming ? t("confirmTitle", { decision: t(`decisions.${confirming}`) }) : ""}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm">{confirming ? t(`confirmBody.${confirming}`) : ""}</p>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("cancel")}</Button>
              </DialogClose>
              <Button
                disabled={pending}
                onClick={() => {
                  const chosen = confirming!;
                  setConfirming(null);
                  startTransition(async () => {
                    const result = await decideAction(
                      target.orgSlug,
                      target.clientSlug,
                      target.interviewId,
                      chosen,
                    );
                    if (result.ok) {
                      toast.success(t("decisionSaved"));
                      router.refresh();
                    } else toast.error(t(`errors.${result.error}`));
                  });
                }}
              >
                {t("confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------------------------------------
// Transcript and AI report (M11-5, M11-6)
// -------------------------------------------------------------------------------------------------

export function ReportTab({
  target,
  workspace,
  canWork,
}: {
  target: Target;
  workspace: Workspace;
  canWork: boolean;
}) {
  const t = useTranslations("Workspace");
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [pending, startTransition] = useTransition();
  const report = workspace.report;
  const people = workspace.evaluations;

  // While the report is being written, look again every few seconds.
  useEffect(() => {
    if (report?.status !== "pending") return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [report?.status, router]);

  const peopleAverage = (criterionId: string) => {
    const values = people
      .map((e) => e.scores[criterionId])
      .filter((v): v is number => typeof v === "number");
    return values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "—";
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("transcript")}</CardTitle>
          <CardDescription>{t("transcriptHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!workspace.interview.recordingAllowed ? (
            <p className="text-sm text-destructive">{t("recordingDeclined")}</p>
          ) : canWork ? (
            <>
              <Label htmlFor="transcript-file">{t("transcriptFile")}</Label>
              <Input
                id="transcript-file"
                type="file"
                accept=".vtt,.srt,.txt,text/plain,text/vtt"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setRaw(await file.text());
                }}
              />
              <Label htmlFor="transcript-text">{t("transcriptPaste")}</Label>
              <Textarea
                id="transcript-text"
                rows={6}
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={t("transcriptPlaceholder")}
              />
              <Button
                className="justify-self-start"
                disabled={pending || !raw.trim()}
                onClick={() =>
                  startTransition(async () => {
                    const result = await uploadTranscriptAction(
                      target.orgSlug,
                      target.clientSlug,
                      target.interviewId,
                      raw,
                    );
                    if (result.ok) {
                      toast.success(t("transcriptSaved", { count: result.segments }));
                      setRaw("");
                    } else toast.error(t(`errors.${result.error}`));
                  })
                }
              >
                {workspace.transcript ? t("replaceTranscript") : t("saveTranscript")}
              </Button>
            </>
          ) : null}
          {workspace.transcript ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t("transcriptShow", { count: workspace.transcript.segments.length })}
              </summary>
              <ol className="mt-2 grid max-h-80 gap-1 overflow-y-auto">
                {workspace.transcript.segments.map((s, i) => (
                  <li key={i} className="text-xs">
                    {s.t !== null ? (
                      <span className="mr-2 text-muted-foreground tabular-nums">
                        {formatTime(s.t)}
                      </span>
                    ) : null}
                    {s.speaker ? <span className="mr-1 font-medium">{s.speaker}:</span> : null}
                    {s.text}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("report")}</CardTitle>
          <CardDescription>{t("reportHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {canWork ? (
            <Button
              className="justify-self-start"
              disabled={pending || !workspace.transcript || report?.status === "pending"}
              onClick={() =>
                startTransition(async () => {
                  const result = await requestReportAction(
                    target.orgSlug,
                    target.clientSlug,
                    target.interviewId,
                  );
                  if (!result.ok) toast.error(t(`errors.${result.error}`));
                })
              }
            >
              {report ? t("redoReport") : t("makeReport")}
            </Button>
          ) : null}
          {report?.status === "pending" ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {t("reportPending")}
            </p>
          ) : null}
          {report?.status === "failed" ? (
            <p className="text-sm text-destructive">{t("reportFailed")}</p>
          ) : null}
          {report?.status === "ready" ? (
            <>
              <div className="flex flex-wrap items-baseline gap-4">
                {report.total !== null ? (
                  <p className="text-sm">{t("aiTotal", { score: report.total.toFixed(1) })}</p>
                ) : null}
                {report.rank && report.rank.of > 1 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("rank", { rank: report.rank.rank, of: report.rank.of })}
                  </p>
                ) : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3 font-medium">{t("criterion")}</th>
                      <th className="py-2 pr-3 font-medium">{t("people")}</th>
                      <th className="py-2 pr-3 font-medium">{t("ai")}</th>
                      <th className="py-2 font-medium">{t("evidence")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RUBRIC.map((c) => {
                      const s = report.scores.find((x) => x.criterionId === c.id);
                      return (
                        <tr key={c.id} className="border-b align-top">
                          <td className="py-2 pr-3">{c.label}</td>
                          <td className="py-2 pr-3 tabular-nums">{peopleAverage(c.id)}</td>
                          <td className="py-2 pr-3 tabular-nums">{s?.score ?? "—"}</td>
                          <td className="py-2">
                            {s?.comment ? <p>{s.comment}</p> : null}
                            <ul className="mt-1 grid gap-0.5">
                              {(s?.evidence ?? []).map((e, i) => (
                                <li key={i} className="text-xs text-muted-foreground">
                                  {e.t !== null ? (
                                    <span className="mr-1 tabular-nums">[{formatTime(e.t)}]</span>
                                  ) : null}
                                  「{e.quote}」
                                  {!e.verified ? (
                                    <Badge variant="outline" className="ml-1 border-amber-500">
                                      {t("unverified")}
                                    </Badge>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {report.summary ? (
                <div className="grid gap-1">
                  <p className="text-sm font-medium">{t("summary")}</p>
                  <p className="text-sm whitespace-pre-wrap">{report.summary}</p>
                </div>
              ) : null}
              {report.needs.length > 0 ? (
                <div className="grid gap-1">
                  <p className="text-sm font-medium">{t("needs")}</p>
                  <ul className="flex flex-wrap gap-1">
                    {report.needs.map((n) => (
                      <li key={n}>
                        <Badge variant="secondary">{n}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
