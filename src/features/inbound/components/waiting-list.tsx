"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { dismissWaitAction, saveNudgeTemplateAction } from "../actions";
import { nudgeIsValid, renderNudge } from "../nudge";
import type { WaitRow } from "../queries";

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

/** Board applicants who haven't entered yet, with the nudge text to paste (docs/02 M3-11). */
export function WaitingList({
  target,
  rows,
  nudgeTemplate,
  canEdit,
  canEditTemplate,
}: {
  target: { orgSlug: string; clientSlug: string };
  rows: WaitRow[];
  nudgeTemplate: string;
  canEdit: boolean;
  canEditTemplate: boolean;
}) {
  const t = useTranslations("Waiting");
  const [template, setTemplate] = useState(nudgeTemplate);
  const [pending, startTransition] = useTransition();
  const entryUrls = `/app/${target.orgSlug}/${target.clientSlug}/entry-urls`;

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("board")}</TableHead>
                  <TableHead>{t("job")}</TableHead>
                  <TableHead>{t("notifiedAt")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.applicantName}</TableCell>
                    <TableCell>{row.channel}</TableCell>
                    <TableCell className="max-w-56 truncate">{row.jobTitle}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      {dateFormat.format(new Date(row.notifiedAt))}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {row.entryUrl ? (
                        <CopyButton
                          value={renderNudge(template, {
                            name: row.applicantName,
                            job: row.jobTitle,
                            url: row.entryUrl,
                          })}
                          label={t("copy")}
                        />
                      ) : (
                        <Link
                          href={entryUrls}
                          className="text-sm text-primary underline-offset-4 hover:underline"
                        >
                          {t("noEntryUrl")}
                        </Link>
                      )}
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          aria-label={t("dismissFor", { name: row.applicantName })}
                          onClick={() =>
                            startTransition(() =>
                              dismissWaitAction(target.orgSlug, target.clientSlug, row.id),
                            )
                          }
                        >
                          {t("dismiss")}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("nudgeTitle")}</CardTitle>
          <CardDescription>{t("nudgeHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label htmlFor="nudge-template" className="sr-only">
            {t("nudgeTitle")}
          </Label>
          <Textarea
            id="nudge-template"
            rows={7}
            maxLength={1000}
            value={template}
            readOnly={!canEditTemplate}
            aria-invalid={nudgeIsValid(template) ? undefined : true}
            onChange={(e) => setTemplate(e.target.value)}
          />
          {!nudgeIsValid(template) ? (
            <p className="text-sm text-destructive">{t("nudgeNeedsUrl")}</p>
          ) : null}
          {canEditTemplate ? (
            <Button
              className="justify-self-start"
              disabled={pending || template === nudgeTemplate || !nudgeIsValid(template)}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveNudgeTemplateAction(
                    target.orgSlug,
                    target.clientSlug,
                    template,
                  );
                  if (result.ok) toast.success(t("saved"));
                })
              }
            >
              {t("save")}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
