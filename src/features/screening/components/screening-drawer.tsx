"use client";

import {
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { MAX_DOCUMENT_BYTES } from "@/features/intake/entry-schema";
import { shrinkImage } from "@/lib/image-resize";
import { uploadToSignedUrl } from "@/lib/upload";
import { cn } from "@/lib/utils";
import {
  createStaffUploadAction,
  type Decision,
  decideAction,
  documentLinkAction,
  finishStaffUploadAction,
  rereadAction,
} from "../actions";
import type { CriterionOutcome } from "../domain";
import type { ScreeningDetail } from "../queries";
import { VerdictBadge } from "./verdict-badge";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/** The screening drawer (docs/01 §5.5): why the AI decided, the evidence, and the human decision. */
export function ScreeningDrawer({
  target,
  detail,
  closeHref,
  canEdit,
}: {
  target: { orgSlug: string; clientSlug: string };
  detail: ScreeningDetail;
  closeHref: string;
  canEdit: boolean;
}) {
  const t = useTranslations("Screening");
  const router = useRouter();
  const outcomes = detail.run?.outcomes ?? [];
  const basic = outcomes.filter((o) => o.type === "basic");
  const specialist = outcomes.filter((o) => o.type === "specialist");

  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <SheetTitle className="text-lg">{detail.candidateName}</SheetTitle>
            <VerdictBadge verdict={detail.verdict} />
          </div>
          <SheetDescription>
            {timeFormat.format(new Date(detail.appliedAt))}
            {detail.channel ? `・${detail.channel}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 p-4">
          <ScoreBar score={detail.score} passLine={detail.passLine} failLine={detail.failLine} />

          {detail.run ? (
            <Section title={t("drawer.reasonsTitle")}>
              <ul className="grid gap-1 text-sm">
                {detail.run.reasons.map((reason) => (
                  <li key={reason}>{t(`reasons.${reason}` as "reasons.aboveLine")}</li>
                ))}
              </ul>
            </Section>
          ) : (
            <p className="text-sm text-muted-foreground">{t("drawer.noRun")}</p>
          )}

          {basic.length > 0 ? (
            <Section title={t("drawer.basicTitle")}>
              <ul className="grid gap-3">
                {basic.map((o) => (
                  <OutcomeItem key={o.criterionId} outcome={o} />
                ))}
              </ul>
            </Section>
          ) : null}

          {specialist.length > 0 ? (
            <Section title={t("drawer.specialistTitle")}>
              <ul className="grid gap-3">
                {specialist.map((o) => (
                  <OutcomeItem key={o.criterionId} outcome={o} />
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title={t("drawer.answersTitle")}>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t("drawer.residence")}</dt>
              <dd>{[detail.prefecture, detail.city].filter(Boolean).join(" ") || "—"}</dd>
              {detail.answers.map((a) => (
                <div key={a.key} className="contents">
                  <dt className="text-muted-foreground">{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Documents target={target} detail={detail} canEdit={canEdit} outcomes={outcomes} />

          {canEdit ? <Decisions target={target} detail={detail} /> : null}

          {detail.decisions.length > 0 ? (
            <Section title={t("drawer.historyTitle")}>
              <ol className="grid gap-2 text-sm">
                {detail.decisions.map((d, index) => (
                  <li key={index} className="grid gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <VerdictBadge verdict={d.verdict} />
                      <span className="text-muted-foreground">
                        {t(`drawer.sources.${d.source}` as "drawer.sources.ai")}
                        {d.by ? `（${d.by}）` : ""}・{timeFormat.format(new Date(d.at))}
                      </span>
                    </div>
                    {d.note ? <p className="whitespace-pre-wrap">{d.note}</p> : null}
                  </li>
                ))}
              </ol>
            </Section>
          ) : null}

          <p className="border-t pt-4 text-xs text-muted-foreground">
            {t("drawer.disclaimer")}
            {detail.run
              ? ` ${t("drawer.model", {
                  time: timeFormat.format(new Date(detail.run.createdAt)),
                  model: detail.run.model ?? "—",
                })}`
              : ""}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function ScoreBar({
  score,
  passLine,
  failLine,
}: {
  score: number | null;
  passLine: number;
  failLine: number;
}) {
  const t = useTranslations("Screening.drawer");
  if (score === null) return <p className="text-sm text-muted-foreground">{t("noScore")}</p>;
  return (
    <div className="grid gap-2">
      <p className="text-sm">
        <span className="text-3xl font-bold tabular-nums">{score}</span>
        <span className="sr-only">{t("scoreLabel", { score, line: passLine })}</span>
        <span aria-hidden className="ml-1 text-muted-foreground">
          / 100
        </span>
      </p>
      <div className="relative h-2 rounded-full bg-muted" aria-hidden>
        <div
          className={cn(
            "h-full rounded-full",
            score >= passLine
              ? "bg-emerald-600"
              : score < failLine
                ? "bg-destructive"
                : "bg-amber-500",
          )}
          style={{ width: `${score}%` }}
        />
        <div className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${passLine}%` }} />
      </div>
      <p className="text-xs text-muted-foreground" aria-hidden>
        {t("scoreLabel", { score, line: passLine })}
      </p>
    </div>
  );
}

function OutcomeItem({ outcome: o }: { outcome: CriterionOutcome }) {
  const t = useTranslations("Screening.drawer");
  const state =
    o.type === "basic"
      ? o.met === true
        ? "yes"
        : o.met === false
          ? "no"
          : "unknown"
      : o.match === "yes" || o.match === "partial"
        ? "yes"
        : o.match === "no"
          ? "no"
          : "unknown";
  const Icon = state === "yes" ? CircleCheckIcon : state === "no" ? CircleXIcon : CircleHelpIcon;
  const label =
    o.type === "basic"
      ? t(state === "yes" ? "met" : state === "no" ? "notMet" : "unknown")
      : t(`match.${o.match ?? "not_stated"}`);

  return (
    <li className="grid gap-1.5 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Icon
          className={cn(
            "size-4 shrink-0",
            state === "yes" && "text-emerald-600",
            state === "no" && "text-destructive",
            state === "unknown" && "text-amber-600",
          )}
          aria-hidden
        />
        <span className="font-medium">{o.label}</span>
        {o.required ? <Badge variant="secondary">{t("required")}</Badge> : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {label}・{t("points", { points: Math.round(o.points * 10) / 10 })}
        </span>
      </div>
      {o.value ? <p className="text-sm">{o.value}</p> : null}
      {o.evidence ? (
        <blockquote
          className={cn(
            "border-l-2 pl-3 text-sm",
            o.evidenceVerified === false ? "border-destructive" : "border-primary",
          )}
        >
          <p className="text-xs text-muted-foreground">{t("quote")}</p>
          <p className="whitespace-pre-wrap">「{o.evidence}」</p>
          {o.evidenceVerified === false ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
              <TriangleAlertIcon className="size-3.5" aria-hidden />
              {t("quoteMissing")}
            </p>
          ) : null}
        </blockquote>
      ) : null}
    </li>
  );
}

/** Marks the AI's verified quotes inside a transcript. */
function Highlighted({ text, quotes }: { text: string; quotes: string[] }) {
  const ranges: [number, number][] = [];
  for (const quote of quotes) {
    const at = text.indexOf(quote);
    if (at >= 0) ranges.push([at, at + quote.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="rounded bg-amber-200/70 dark:bg-amber-500/30">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function Documents({
  target: { orgSlug, clientSlug },
  detail,
  canEdit,
  outcomes,
}: {
  target: { orgSlug: string; clientSlug: string };
  detail: ScreeningDetail;
  canEdit: boolean;
  outcomes: CriterionOutcome[];
}) {
  const t = useTranslations("Screening");
  const entry = useTranslations("Entry");
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<"resume" | "cv">("resume");
  const input = useRef<HTMLInputElement>(null);
  const quotes = outcomes.filter((o) => o.evidence && o.evidenceVerified).map((o) => o.evidence!);

  async function open(documentId: string) {
    // Open the tab now: browsers block windows opened after an await.
    const tab = window.open("", "_blank");
    const result = await documentLinkAction(orgSlug, clientSlug, documentId);
    if (result.ok && tab) {
      tab.opener = null;
      tab.location.href = result.url;
    } else {
      tab?.close();
    }
  }

  function upload(file: File) {
    startTransition(async () => {
      try {
        const prepared =
          file.type === "application/pdf"
            ? file
            : await shrinkImage(file, { maxBytes: MAX_DOCUMENT_BYTES });
        const ticket = await createStaffUploadAction(orgSlug, clientSlug, detail.applicationId, {
          kind,
          name: prepared.name.slice(0, 200),
          type: prepared.type,
          size: prepared.size,
        });
        if (!ticket.ok) throw new Error("No upload URL");
        await uploadToSignedUrl("documents", ticket.path, ticket.token, prepared);
        await finishStaffUploadAction(orgSlug, clientSlug, detail.applicationId);
        toast.success(t("drawer.uploaded"));
      } catch {
        toast.error(t("drawer.uploadFailed"));
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <Section title={t("drawer.documentsTitle")}>
      <ul className="grid gap-2">
        {detail.documents.map((doc) => {
          const state =
            doc.status === "uploading"
              ? "uploading"
              : doc.status === "rejected"
                ? "skipped"
                : doc.readStatus;
          return (
            <li key={doc.id} className="grid gap-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {doc.kind === "cv" ? entry("documents.cv") : entry("documents.resume")}
                </Badge>
                <span className="min-w-0 flex-1 truncate">{doc.fileName}</span>
                {doc.status === "ready" ? (
                  <Button variant="ghost" size="sm" onClick={() => void open(doc.id)}>
                    <ExternalLinkIcon aria-hidden />
                    {t("drawer.open")}
                  </Button>
                ) : null}
              </div>
              <p
                className={cn(
                  "text-xs text-muted-foreground",
                  (state === "failed" || state === "skipped") && "text-destructive",
                )}
              >
                {t(`drawer.states.${state}` as "drawer.states.done")}
                {doc.pages ? `・${t("drawer.pages", { pages: doc.pages })}` : ""}
                {doc.uploadedBy === "staff" ? `・${t("drawer.byStaff")}` : ""}
              </p>
              {doc.transcript ? (
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    {t("drawer.transcript")}
                  </summary>
                  <p className="mt-2 max-h-80 overflow-y-auto rounded bg-muted/50 p-2 text-xs leading-relaxed whitespace-pre-wrap">
                    <Highlighted text={doc.transcript} quotes={quotes} />
                  </p>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pending || detail.documents.every((d) => d.status !== "ready")}
            onClick={() =>
              startTransition(async () => {
                await rereadAction(orgSlug, clientSlug, detail.applicationId);
                toast.success(t("drawer.rereading"));
              })
            }
          >
            <RefreshCwIcon aria-hidden />
            {t("drawer.reread")}
          </Button>
          <div className="grid gap-1">
            <Label htmlFor="staff-upload-kind" className="sr-only">
              {t("drawer.uploadKind")}
            </Label>
            <NativeSelect
              id="staff-upload-kind"
              className="w-36"
              value={kind}
              onChange={(e) => setKind(e.target.value as "resume" | "cv")}
            >
              <option value="resume">{entry("documents.resume")}</option>
              <option value="cv">{entry("documents.cv")}</option>
            </NativeSelect>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <UploadIcon aria-hidden />
            {t("drawer.upload")}
          </Button>
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            aria-label={t("drawer.upload")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </div>
      ) : null}
    </Section>
  );
}

function Decisions({
  target: { orgSlug, clientSlug },
  detail,
}: {
  target: { orgSlug: string; clientSlug: string };
  detail: ScreeningDetail;
}) {
  const t = useTranslations("Screening.drawer");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const locked =
    !["applied", "screening", "booking"].includes(detail.stage) ||
    (detail.outcome !== "active" && detail.outcome !== "rejected");

  function decide(decision: Decision) {
    startTransition(async () => {
      const result = await decideAction(orgSlug, clientSlug, detail.applicationId, decision, note);
      if (!result.ok) {
        toast.error(t(result.error === "noRun" ? "noRun" : "locked"));
        return;
      }
      setNote("");
      toast.success(t("decided"));
    });
  }

  if (locked) return <p className="text-sm text-muted-foreground">{t("locked")}</p>;
  return (
    <Section title={t("decisionTitle")}>
      <Label htmlFor="decision-note" className="sr-only">
        {t("note")}
      </Label>
      <Textarea
        id="decision-note"
        rows={2}
        maxLength={500}
        placeholder={t("note")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => decide("pass")}>
          {t("pass")}
        </Button>
        <Button variant="destructive" disabled={pending} onClick={() => decide("fail")}>
          {t("fail")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => decide("check")}>
          {t("check")}
        </Button>
        {detail.run && detail.verdict !== detail.run.verdict ? (
          <Button variant="ghost" disabled={pending} onClick={() => decide("revert")}>
            {t("revert")}
          </Button>
        ) : null}
      </div>
    </Section>
  );
}
