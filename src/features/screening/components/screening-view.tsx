"use client";

import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { confirmRejectionsAction } from "../actions";
import type { DocumentState, ScreeningFilter, ScreeningRow } from "../queries";
import { SCREENING_FILTERS } from "../screening-filters";
import { VerdictBadge } from "./verdict-badge";

export type SerializedRow = Omit<ScreeningRow, "appliedAt"> & { appliedAt: string };

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  timeZone: "Asia/Tokyo",
});

/** Job picker, filter tabs and the applications table of the screening screen (docs/01 §5.5). */
export function ScreeningView({
  base,
  jobs,
  jobId,
  filter,
  rows,
  counts,
  canEdit,
  openId,
}: {
  base: string;
  jobs: { id: string; title: string }[];
  jobId: string;
  filter: ScreeningFilter;
  rows: SerializedRow[];
  counts: Record<ScreeningFilter, number>;
  canEdit: boolean;
  openId: string | null;
}) {
  const t = useTranslations("Screening");
  const untitled = useTranslations("Jobs")("untitled");
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [orgSlug, clientSlug] = base.split("/").slice(2, 4) as [string, string];

  const href = (patch: { job?: string; filter?: ScreeningFilter; app?: string | null }) => {
    const params = new URLSearchParams({ job: patch.job ?? jobId });
    const f = patch.filter ?? filter;
    if (f !== "all") params.set("filter", f);
    const app = patch.app === undefined ? openId : patch.app;
    if (app) params.set("app", app);
    return `${base}/screening?${params}`;
  };

  const confirmable = rows.filter((r) => r.verdict === "fail_pending").map((r) => r.applicationId);

  function confirm() {
    startTransition(async () => {
      const { confirmed } = await confirmRejectionsAction(orgSlug, clientSlug, selected);
      setSelected([]);
      toast.success(t("confirm.done", { count: confirmed }));
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-2 sm:max-w-md">
          <label htmlFor="screening-job" className="text-sm font-medium">
            {t("job")}
          </label>
          <NativeSelect
            id="screening-job"
            value={jobId}
            onChange={(e) => router.push(href({ job: e.target.value, filter: "all", app: null }))}
          >
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title || untitled}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button asChild variant="outline">
          <Link href={`${base}/screening/criteria?job=${jobId}`}>
            <SlidersHorizontalIcon aria-hidden />
            {t("criteriaLink")}
          </Link>
        </Button>
      </div>

      <nav aria-label={t("title")} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {SCREENING_FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ filter: f, app: null })}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-muted",
              f === filter && "bg-muted font-medium",
            )}
          >
            {t(`filters.${f}`)}
            <span className="text-xs text-muted-foreground tabular-nums">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      {canEdit && confirmable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span>{t("confirm.selected", { count: selected.length })}</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || selected.length === 0}
            onClick={confirm}
          >
            {t("confirm.button")}
          </Button>
        </div>
      ) : null}

      <Card className="py-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {canEdit && confirmable.length > 0 ? (
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      aria-label={t("confirm.selectAll")}
                      checked={selected.length > 0 && selected.length === confirmable.length}
                      onCheckedChange={(checked) => setSelected(checked ? confirmable : [])}
                    />
                  </TableHead>
                ) : null}
                <TableHead className="pl-4">{t("columns.candidate")}</TableHead>
                <TableHead>{t("columns.applied")}</TableHead>
                <TableHead>{t("columns.basic")}</TableHead>
                <TableHead className="text-right">{t("columns.score")}</TableHead>
                <TableHead>{t("columns.verdict")}</TableHead>
                <TableHead className="pr-4">{t("columns.documents")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.applicationId}
                  data-state={row.applicationId === openId ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => router.push(href({ app: row.applicationId }), { scroll: false })}
                >
                  {canEdit && confirmable.length > 0 ? (
                    <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                      {row.verdict === "fail_pending" ? (
                        <Checkbox
                          aria-label={t("confirm.select", { name: row.candidateName })}
                          checked={selected.includes(row.applicationId)}
                          onCheckedChange={(checked) =>
                            setSelected((s) =>
                              checked
                                ? [...s, row.applicationId]
                                : s.filter((id) => id !== row.applicationId),
                            )
                          }
                        />
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell className="pl-4">
                    <Link
                      href={href({ app: row.applicationId })}
                      scroll={false}
                      className="font-medium underline-offset-4 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.candidateName}
                    </Link>
                    {row.channel ? (
                      <p className="text-xs text-muted-foreground">{row.channel}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm">
                    {dateFormat.format(new Date(row.appliedAt))}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {row.basicTotal > 0 ? `${row.basicMet}/${row.basicTotal}` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.score ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <VerdictBadge verdict={row.verdict} />
                      {row.stage !== "applied" &&
                      row.stage !== "screening" &&
                      row.outcome === "active" ? (
                        <Badge variant="secondary">{t("movedOn")}</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="pr-4 text-xs">
                    <DocState label={t("docs.resume")} state={row.resume} />
                    <DocState label={t("docs.cv")} state={row.cv} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function DocState({ label, state }: { label: string; state: DocumentState }) {
  const t = useTranslations("Screening.docs");
  return (
    <p
      className={cn(
        state === "failed" && "text-destructive",
        state === "none" && "text-muted-foreground",
      )}
    >
      {label}：{t(state)}
    </p>
  );
}
