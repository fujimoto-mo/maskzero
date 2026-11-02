"use client";

import { CopyIcon, EllipsisIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { deleteJobAction, duplicateJobAction, setJobStatusAction } from "../actions";
import type { JobStatus } from "./status-badge";

/** Publish / stop, plus duplicate and delete (archive when the job has applicants). */
export function JobActions({
  orgSlug,
  clientSlug,
  jobId,
  status,
  hasApplications,
  ready,
  beforePublish,
}: {
  orgSlug: string;
  clientSlug: string;
  jobId: string;
  status: JobStatus;
  hasApplications: boolean;
  /** No check errors in the current form. */
  ready: boolean;
  /** Saves unsaved edits first; false stops the publish. */
  beforePublish: () => Promise<boolean>;
}) {
  const t = useTranslations("Jobs.actions");
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function changeStatus(next: "draft" | "published" | "stopped") {
    if (next === "published" && !ready) {
      toast.error(t("notReady"));
      return;
    }
    startTransition(async () => {
      if (next === "published" && !(await beforePublish())) return;
      const result = await setJobStatusAction(orgSlug, clientSlug, jobId, next);
      if (!result.ok) {
        toast.error(t("notReady"));
        return;
      }
      toast.success(
        t(next === "published" ? "published" : next === "stopped" ? "stopped" : "drafted"),
      );
    });
  }

  return (
    <div className="flex items-center gap-1">
      {status === "published" ? (
        <Button variant="outline" disabled={pending} onClick={() => changeStatus("stopped")}>
          {t("stop")}
        </Button>
      ) : (
        <Button disabled={pending} onClick={() => changeStatus("published")}>
          {t("publish")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("more")} disabled={pending}>
            <EllipsisIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "stopped" ? (
            <DropdownMenuItem onSelect={() => changeStatus("draft")}>
              {t("toDraft")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onSelect={() => startTransition(() => duplicateJobAction(orgSlug, clientSlug, jobId))}
          >
            <CopyIcon aria-hidden />
            {t("duplicate")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2Icon aria-hidden />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasApplications ? t("archiveTitle") : t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {hasApplications ? t("archiveBody") : t("deleteBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => startTransition(() => deleteJobAction(orgSlug, clientSlug, jobId))}
            >
              {hasApplications ? t("confirmArchive") : t("confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
