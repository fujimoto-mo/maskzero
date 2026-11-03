"use client";

import { EllipsisIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { changeStageAction } from "@/features/candidates/actions";
import { formatSlot } from "@/features/scheduling/slots";
import { cn } from "@/lib/utils";
import {
  bookingLinkAction,
  confirmRequestAction,
  markInterviewAction,
  resendInvitationAction,
} from "../actions";
import type { InvitationRow } from "../queries";
import { INTERVIEW_TABS, type InterviewTab } from "../tabs";

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  timeZone: "Asia/Tokyo",
});
const slotText = (s: { startsAt: string; endsAt: string }) =>
  formatSlot({ startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) });

/** The "to interview" list (docs/02 M7-2): action needed first, with per-row actions. */
export function InterviewsView({
  base,
  tab,
  rows,
  canEdit,
}: {
  base: string;
  tab: InterviewTab;
  rows: InvitationRow[];
  canEdit: boolean;
}) {
  const t = useTranslations("Interviews");
  return (
    <div className="grid gap-4">
      <nav aria-label={t("title")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {INTERVIEW_TABS.map((item) => (
          <Link
            key={item}
            href={`${base}/interviews?tab=${item}`}
            aria-current={item === tab ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              item === tab && "bg-muted font-medium",
            )}
          >
            {t(`tabs.${item}`)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">{t("empty")}</Card>
      ) : (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <InvitationItem key={row.invitationId} base={base} row={row} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InvitationItem({
  base,
  row,
  canEdit,
}: {
  base: string;
  row: InvitationRow;
  canEdit: boolean;
}) {
  const t = useTranslations("Interviews");
  const [pending, startTransition] = useTransition();
  // Canceling an interview or recording a withdrawal asks first.
  const [confirming, setConfirming] = useState<"cancel" | "withdraw" | null>(null);
  const [orgSlug, clientSlug] = base.split("/").slice(2, 4) as [string, string];
  const meeting = row.interview;
  const open = row.outcome === "active" && (row.status === "sent" || row.status === "opened");

  const run = (work: () => Promise<{ ok: boolean }>, done: string, fail?: string) =>
    startTransition(async () => {
      const result = await work();
      if (result.ok) toast.success(done);
      else if (fail) toast.error(fail);
    });

  async function copyLink() {
    const result = await bookingLinkAction(orgSlug, clientSlug, row.invitationId);
    if (!result.ok) return;
    await navigator.clipboard.writeText(result.url);
    toast.success(t("copied"));
  }

  return (
    <li className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <Link
            href={`${base}/candidates?app=${row.applicationId}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.candidateName}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {row.jobTitle}・{t("round", { round: row.round })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={row.status === "booked" ? "default" : "secondary"}>
            {t(`status.${row.status}`)}
          </Badge>
          {row.action ? (
            <Badge
              variant="outline"
              className="border-amber-500 text-amber-800 dark:text-amber-300"
            >
              {t(`actionNeeded.${row.action}`)}
            </Badge>
          ) : null}
        </div>
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("menu", { name: row.candidateName })}
                disabled={pending}
              >
                <EllipsisIcon aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {open ? (
                <>
                  <DropdownMenuItem onSelect={() => void copyLink()}>
                    {t("copyLink")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      run(
                        () => resendInvitationAction(orgSlug, clientSlug, row.invitationId),
                        t("resent"),
                      )
                    }
                  >
                    {t("resend")}
                  </DropdownMenuItem>
                </>
              ) : null}
              {meeting?.status === "scheduled" ? (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      run(
                        () => markInterviewAction(orgSlug, clientSlug, meeting.id, "done"),
                        t("updated"),
                      )
                    }
                  >
                    {t("done")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      run(
                        () => markInterviewAction(orgSlug, clientSlug, meeting.id, "no_show"),
                        t("updated"),
                      )
                    }
                  >
                    {t("noShow")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirming("cancel")}>
                    {t("cancel")}
                  </DropdownMenuItem>
                </>
              ) : null}
              {row.outcome === "active" ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setConfirming("withdraw")}
                  >
                    {t("withdraw")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{t("sentAt", { date: dateFormat.format(new Date(row.sentAt)) })}</span>
        {row.firstOpenedAt ? (
          <span>{t("openedAt", { date: dateFormat.format(new Date(row.firstOpenedAt)) })}</span>
        ) : null}
        {row.followupCount > 0 ? <span>{t("followups", { count: row.followupCount })}</span> : null}
      </p>

      {meeting ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{t(`interview.${meeting.status}`)}</Badge>
          <span className="tabular-nums">{slotText(meeting)}</span>
          {meeting.status !== "scheduled" ? null : meeting.meetingUrl ? (
            <a
              href={meeting.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("join")}
            </a>
          ) : meeting.location ? (
            <span className="text-muted-foreground">{meeting.location}</span>
          ) : null}
          {meeting.status === "canceled" ? null : (
            <Link
              href={`${base}/meetings/${meeting.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("openWorkspace")}
            </Link>
          )}
        </div>
      ) : null}

      {row.request &&
      (row.request.status === "pending" || row.request.status === "unmatched") &&
      open ? (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm">
          <p className="font-medium">{t("preferred")}</p>
          <ul className="grid gap-1.5">
            {row.request.preferred.map((slot, index) => (
              <li key={slot.startsAt} className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">
                  {index + 1}. {slotText(slot)}
                </span>
                {canEdit ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={pending}
                    aria-label={t("confirmSlotAt", { slot: slotText(slot) })}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await confirmRequestAction(
                          orgSlug,
                          clientSlug,
                          row.request!.id,
                          index,
                        );
                        if (result.ok) toast.success(t("confirmed"));
                        else toast.error(t("taken"));
                      })
                    }
                  >
                    {t("confirmSlot")}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {row.request.concerns.length > 0 ? (
            <p className="text-xs">
              {t("concerns")}：{row.request.concerns.join("・")}
            </p>
          ) : null}
          {row.request.memo ? (
            <p className="text-xs whitespace-pre-wrap">
              {t("memo")}：{row.request.memo}
            </p>
          ) : null}
        </div>
      ) : null}

      <Dialog open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(confirming === "withdraw" ? "withdrawTitle" : "cancelTitle", {
                name: row.candidateName,
              })}
            </DialogTitle>
            <DialogDescription>
              {t(confirming === "withdraw" ? "withdrawBody" : "cancelBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("keep")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const action = confirming;
                setConfirming(null);
                if (action === "withdraw") {
                  run(
                    () => changeStageAction(orgSlug, clientSlug, row.applicationId, "withdrawn"),
                    t("updated"),
                  );
                } else if (action === "cancel" && meeting) {
                  run(
                    () => markInterviewAction(orgSlug, clientSlug, meeting.id, "canceled"),
                    t("updated"),
                  );
                }
              }}
            >
              {t(confirming === "withdraw" ? "withdraw" : "cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
