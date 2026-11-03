"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { suggestJobAction } from "../actions";
import type { PoolJob, PoolRow } from "../queries";

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeZone: "Asia/Tokyo",
});

/** Opted-in candidates and suggesting them a job (docs/02 M5-6). */
export function PoolView({
  target,
  rows,
  jobs,
}: {
  target: { orgSlug: string; clientSlug: string };
  rows: PoolRow[];
  jobs: PoolJob[];
}) {
  const t = useTranslations("Pool");
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("lastApplication")}</TableHead>
              <TableHead>{t("suggested")}</TableHead>
              <TableHead>{t("suggest")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <PoolItem key={row.candidateId} target={target} row={row} jobs={jobs} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PoolItem({
  target,
  row,
  jobs,
}: {
  target: { orgSlug: string; clientSlug: string };
  row: PoolRow;
  jobs: PoolJob[];
}) {
  const t = useTranslations("Pool");
  const options = jobs.filter((j) => !row.excludedJobIds.includes(j.id));
  const [jobId, setJobId] = useState(options[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const selectId = `pool-job-${row.candidateId}`;

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="text-sm">
        <p>
          {row.lastClient}・{row.lastJob}
        </p>
        <p className="text-xs text-muted-foreground">
          {dateFormat.format(new Date(row.lastAppliedAt))}・
          {t(`outcomes.${row.lastOutcome as "active"}`)}
        </p>
      </TableCell>
      <TableCell className="max-w-48 text-xs text-muted-foreground">
        {row.suggestedJobs.length > 0 ? row.suggestedJobs.join("、") : "—"}
      </TableCell>
      <TableCell>
        {options.length === 0 ? (
          <span className="text-xs text-muted-foreground">{t("noJobs")}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="sr-only">
              {t("jobFor", { name: row.name })}
            </label>
            <NativeSelect
              id={selectId}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              className="w-56"
            >
              {options.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.clientName}・{j.title}
                </option>
              ))}
            </NativeSelect>
            <Button
              size="sm"
              disabled={pending || !jobId}
              onClick={() =>
                startTransition(async () => {
                  const result = await suggestJobAction(
                    target.orgSlug,
                    target.clientSlug,
                    row.candidateId,
                    jobId,
                  );
                  if (result.ok) toast.success(t("sent", { name: row.name }));
                  else toast.error(t(`errors.${result.error}`));
                })
              }
            >
              {t("send")}
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
