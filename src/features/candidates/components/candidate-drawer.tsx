"use client";

import { ExternalLinkIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { documentLinkAction } from "@/features/screening/actions";
import type { Verdict } from "@/features/screening/domain";
import { cn } from "@/lib/utils";
import { changeStageAction, deleteCandidateAction } from "../actions";
import type { CandidateDetail, TimelineItem } from "../queries";
import { allowedChanges, STAGES, type StageChange } from "../stages";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/** The candidate drawer (docs/02 M5-2, M5-3, M5-5). */
export function CandidateDrawer({
  base,
  detail,
  closeHref,
  canEdit,
  canDelete,
}: {
  base: string;
  detail: CandidateDetail;
  closeHref: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("Candidates");
  const router = useRouter();
  const [orgSlug, clientSlug] = base.split("/").slice(2, 4) as [string, string];
  const currentIndex = STAGES.indexOf(detail.stage);

  async function open(documentId: string) {
    const tab = window.open("", "_blank");
    const result = await documentLinkAction(orgSlug, clientSlug, documentId);
    if (result.ok && tab) {
      tab.opener = null;
      tab.location.href = result.url;
    } else {
      tab?.close();
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && router.push(closeHref, { scroll: false })}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader className="border-b">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <SheetTitle className="text-lg">{detail.name}</SheetTitle>
            <Badge variant={detail.outcome === "active" ? "secondary" : "outline"}>
              {t(`outcomes.${detail.outcome}`)}
            </Badge>
          </div>
          <SheetDescription>
            {detail.jobTitle}・{timeFormat.format(new Date(detail.appliedAt))}・
            {detail.channel ?? t(`sources.${detail.source as "entry"}`)}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-6 p-4">
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">{t("drawer.pipeline")}</h3>
            <ol className="flex flex-wrap gap-1 text-xs">
              {STAGES.map((stage, index) => (
                <li
                  key={stage}
                  aria-current={index === currentIndex ? "step" : undefined}
                  className={cn(
                    "rounded-md px-2 py-1",
                    index < currentIndex && "bg-muted text-muted-foreground",
                    index === currentIndex && "bg-primary text-primary-foreground",
                    index > currentIndex && "border text-muted-foreground",
                  )}
                >
                  {t(`stages.${stage}`)}
                  {stage === "booking" && index === currentIndex && detail.currentRound > 1
                    ? `（${t("drawer.round", { round: detail.currentRound })}）`
                    : ""}
                </li>
              ))}
            </ol>
          </section>

          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">{t("drawer.waiting")}</dt>
            <dd>{detail.waitingOn ? t(`waitingOn.${detail.waitingOn}`) : "—"}</dd>
            <dt className="text-muted-foreground">{t("drawer.next")}</dt>
            <dd>
              {detail.nextAction
                ? t(`nextActions.${detail.nextAction as "review_screening"}`)
                : "—"}
            </dd>
          </dl>

          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">{t("drawer.contact")}</h3>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t("drawer.email")}</dt>
              <dd className="break-all">
                {detail.email ? (
                  <a href={`mailto:${detail.email}`} className="underline-offset-4 hover:underline">
                    {detail.email}
                  </a>
                ) : (
                  "—"
                )}
              </dd>
              <dt className="text-muted-foreground">{t("drawer.phone")}</dt>
              <dd>{detail.phone ? <a href={`tel:${detail.phone}`}>{detail.phone}</a> : "—"}</dd>
              <dt className="text-muted-foreground">{t("drawer.residence")}</dt>
              <dd>{[detail.prefecture, detail.city].filter(Boolean).join(" ") || "—"}</dd>
            </dl>
          </section>

          <section className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{t("drawer.documents")}</h3>
              <Button asChild variant="link" size="sm">
                <Link href={`${base}/screening?job=${detail.jobId}&app=${detail.applicationId}`}>
                  {t("drawer.openScreening")}
                </Link>
              </Button>
            </div>
            {detail.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("drawer.noDocuments")}</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {detail.documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{doc.fileName}</span>
                    {doc.ready ? (
                      <Button variant="ghost" size="sm" onClick={() => void open(doc.id)}>
                        <ExternalLinkIcon aria-hidden />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canEdit ? (
            <StageChanger orgSlug={orgSlug} clientSlug={clientSlug} detail={detail} />
          ) : null}

          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">{t("drawer.timeline")}</h3>
            <ol className="grid gap-3 border-l pl-4 text-sm">
              {detail.timeline.map((item, index) => (
                <TimelineEntry key={index} item={item} />
              ))}
            </ol>
          </section>

          {canDelete ? (
            <DeleteCandidate
              orgSlug={orgSlug}
              clientSlug={clientSlug}
              candidateId={detail.candidateId}
              closeHref={closeHref}
            />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TimelineEntry({ item }: { item: TimelineItem }) {
  const t = useTranslations("Candidates");
  const verdicts = useTranslations("Screening.verdicts");
  const key = item.type.replace(/\./g, "_");
  const known = [
    "application_created",
    "application_reentered",
    "application_submitted",
    "documents_added",
    "documents_reread_requested",
    "screening_completed",
    "screening_decided",
    "screening_failed",
    "application_stage_changed",
    "invitation_sent",
    "invitation_resent",
    "invitation_opened",
    "booking_requested",
    "booking_unmatched",
    "interview_scheduled",
    "interview_rescheduled",
    "interview_canceled",
    "interview_done",
    "interview_no_show",
    "message_sent",
    "message_dry_run",
    "message_failed",
    "message_received",
    "interview_assigned",
    "interview_evaluated",
    "transcript_uploaded",
    "report_created",
    "decision_made",
    "decision_undone",
    "ai_interview_invited",
    "ai_interview_started",
    "ai_interview_completed",
    "ai_interview_aborted",
    "ai_interview_expired",
    "ai_interview_scored",
    "ai_interview_scoring_failed",
    "ai_interview_reviewed",
  ];
  const verdict =
    typeof item.payload.verdict === "string" ? verdicts(item.payload.verdict as Verdict) : "";
  const change =
    typeof item.payload.change === "string"
      ? t(`drawer.changes.${item.payload.change as StageChange}`)
      : "";
  const text = known.includes(key)
    ? t(`events.${key as "application_created"}`, {
        verdict,
        change,
        round: String(item.payload.round ?? ""),
        band: String(item.payload.band ?? ""),
      })
    : t("events.other", { type: item.type });

  return (
    <li className="relative">
      <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-border" aria-hidden />
      <p>{text}</p>
      <p className="text-xs text-muted-foreground">
        {t(`drawer.actors.${item.actor}`)}
        {item.actorName ? `（${item.actorName}）` : ""}・{timeFormat.format(new Date(item.at))}
      </p>
    </li>
  );
}

function StageChanger({
  orgSlug,
  clientSlug,
  detail,
}: {
  orgSlug: string;
  clientSlug: string;
  detail: CandidateDetail;
}) {
  const t = useTranslations("Candidates.drawer");
  const options = allowedChanges(detail.stage, detail.outcome);
  const [change, setChange] = useState<StageChange | "">("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  if (options.length === 0) return null;

  function apply() {
    if (!change) return;
    startTransition(async () => {
      const result = await changeStageAction(
        orgSlug,
        clientSlug,
        detail.applicationId,
        change,
        reason,
      );
      if (result.ok) {
        toast.success(t("changed"));
        setChange("");
        setReason("");
      }
    });
  }

  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{t("change")}</h3>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="stage-change" className="sr-only">
            {t("changeTo")}
          </Label>
          <NativeSelect
            id="stage-change"
            className="w-48"
            value={change}
            onChange={(e) => setChange(e.target.value as StageChange | "")}
          >
            <option value="">{t("changeTo")}</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {t(`changes.${option}`)}
              </option>
            ))}
          </NativeSelect>
        </div>
        {change === "withdrawn" || change === "rejected" ? (
          <div className="grid min-w-48 flex-1 gap-1">
            <Label htmlFor="stage-reason" className="sr-only">
              {t("reason")}
            </Label>
            <Input
              id="stage-reason"
              placeholder={t("reason")}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        ) : null}
        <Button disabled={!change || pending} onClick={apply}>
          {t("apply")}
        </Button>
      </div>
    </section>
  );
}

function DeleteCandidate({
  orgSlug,
  clientSlug,
  candidateId,
  closeHref,
}: {
  orgSlug: string;
  clientSlug: string;
  candidateId: string;
  closeHref: string;
}) {
  const t = useTranslations("Candidates.drawer");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="justify-self-start text-destructive">
          <Trash2Icon aria-hidden />
          {t("delete")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle")}</DialogTitle>
          <DialogDescription>{t("deleteBody")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteCandidateAction(orgSlug, clientSlug, candidateId);
                if (result.ok) {
                  toast.success(t("deleted"));
                  router.push(closeHref);
                }
              })
            }
          >
            {t("deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
