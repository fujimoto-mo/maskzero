"use client";

import { ExternalLinkIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobStatusBadge } from "@/features/jobs/components/status-badge";
import { deleteEntryUrlAction, setEntryUrlEnabledAction } from "../actions";
import type { EntryUrlJob, EntryUrlRow } from "../queries";
import { renderEntryMessage } from "../template";

type Target = { orgSlug: string; clientSlug: string };

/** Entry URLs grouped by job, each with copy buttons, the entered count and an on/off switch. */
export function EntryUrlList({
  target,
  jobs,
  template,
  canEdit,
}: {
  target: Target;
  jobs: EntryUrlJob[];
  template: string;
  canEdit: boolean;
}) {
  const t = useTranslations("Intake.list");
  const untitled = useTranslations("Jobs")("untitled");
  const withUrls = jobs.filter((job) => job.urls.length > 0);

  if (withUrls.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="grid gap-4">
      {withUrls.map((job) => (
        <Card key={job.id} className="pb-0">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {job.title || untitled}
              <JobStatusBadge status={job.status} />
            </CardTitle>
            {job.status !== "published" ? (
              <CardDescription>{t("notAccepting")}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t("channel")}</TableHead>
                  <TableHead>{t("url")}</TableHead>
                  <TableHead className="text-right">{t("entered")}</TableHead>
                  <TableHead>{t("accepting")}</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {job.urls.map((row) => (
                  <EntryUrlTableRow
                    key={row.id}
                    target={target}
                    row={row}
                    message={renderEntryMessage(template, { url: row.url, jobTitle: job.title })}
                    canEdit={canEdit}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EntryUrlTableRow({
  target: { orgSlug, clientSlug },
  row,
  message,
  canEdit,
}: {
  target: Target;
  row: EntryUrlRow;
  message: string;
  canEdit: boolean;
}) {
  const t = useTranslations("Intake.list");
  const [pending, startTransition] = useTransition();

  function setEnabled(enabled: boolean) {
    startTransition(async () => {
      await setEntryUrlEnabledAction(orgSlug, clientSlug, row.id, enabled);
      toast.success(enabled ? t("enabledOn") : t("enabledOff"));
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteEntryUrlAction(orgSlug, clientSlug, row.id);
      if (!result.ok) toast.error(t("inUse"));
      else toast.success(t("removed"));
    });
  }

  return (
    <TableRow>
      <TableCell className="pl-4 font-medium">{row.channel}</TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{row.url}</code>
          <CopyButton value={row.url} label={t("copyUrl")} />
          <CopyButton value={message} label={t("copyMessage")} />
          <Button asChild variant="ghost" size="icon-sm" aria-label={t("preview")}>
            <a href={row.url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon aria-hidden />
            </a>
          </Button>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.entered}</TableCell>
      <TableCell>
        <Switch
          checked={row.enabled}
          disabled={!canEdit || pending}
          onCheckedChange={setEnabled}
          aria-label={t("acceptingLabel", { channel: row.channel })}
        />
      </TableCell>
      <TableCell className="pr-4 text-right">
        {canEdit && row.entered === 0 ? (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            onClick={remove}
            aria-label={t("remove")}
          >
            <Trash2Icon aria-hidden />
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
