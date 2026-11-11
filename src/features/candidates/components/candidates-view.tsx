"use client";

import { DownloadIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/native-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { pillTab } from "@/components/pill-tab";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VerdictBadge } from "@/features/screening/components/verdict-badge";
import type { CandidateRow } from "../queries";
import { STAGE_GROUPS, type StageGroup } from "../stages";
import { AddCandidateDialog } from "./add-candidate-dialog";
import { ImportDialog } from "./import-dialog";

const dateFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeZone: "Asia/Tokyo" });

export type ListState = {
  group: StageGroup;
  jobId: string | null;
  q: string;
  cursor: string | null;
};

/** The candidate list (docs/01 §5.6): filter tabs, job picker, search, table and intake actions. */
export function CandidatesView({
  base,
  state,
  jobs,
  rows,
  nextCursor,
  openId,
  canEdit,
}: {
  base: string;
  state: ListState;
  jobs: { id: string; title: string }[];
  rows: CandidateRow[];
  nextCursor: string | null;
  openId: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations("Candidates");
  const untitled = useTranslations("Jobs")("untitled");
  const router = useRouter();
  const [orgSlug, clientSlug] = base.split("/").slice(2, 4) as [string, string];

  const href = (patch: Partial<ListState> & { app?: string | null }) => {
    const next = { ...state, cursor: null, ...patch };
    const params = new URLSearchParams();
    if (next.group !== "all") params.set("group", next.group);
    if (next.jobId) params.set("job", next.jobId);
    if (next.q) params.set("q", next.q);
    if (next.cursor) params.set("cursor", next.cursor);
    const app = patch.app === undefined ? openId : patch.app;
    if (app) params.set("app", app);
    const query = params.toString();
    return `${base}/candidates${query ? `?${query}` : ""}`;
  };
  const exportParams = new URLSearchParams();
  if (state.group !== "all") exportParams.set("group", state.group);
  if (state.jobId) exportParams.set("job", state.jobId);

  return (
    <div className="grid gap-4">
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <AddCandidateDialog orgSlug={orgSlug} clientSlug={clientSlug} jobs={jobs} />
          <ImportDialog orgSlug={orgSlug} clientSlug={clientSlug} jobs={jobs} />
          <Button asChild variant="outline">
            <a href={`${base}/candidates/export?${exportParams}`} download>
              <DownloadIcon aria-hidden />
              {t("export")}
            </a>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <NativeSelect
          aria-label={t("columns.job")}
          className="w-full sm:w-72"
          value={state.jobId ?? ""}
          onChange={(e) => router.push(href({ jobId: e.target.value || null, app: null }))}
        >
          <option value="">{t("allJobs")}</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title || untitled}
            </option>
          ))}
        </NativeSelect>
        <form
          className="flex w-full gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
            router.push(href({ q, app: null }));
          }}
        >
          <Input
            name="q"
            type="search"
            defaultValue={state.q}
            aria-label={t("searchLabel")}
            placeholder={t("searchLabel")}
            className="sm:w-72"
          />
          <Button type="submit" variant="outline" size="icon" aria-label={t("search")}>
            <SearchIcon aria-hidden />
          </Button>
        </form>
      </div>

      <nav aria-label={t("title")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {STAGE_GROUPS.map((group) => (
          <Link
            key={group}
            href={href({ group, app: null })}
            aria-current={group === state.group ? "page" : undefined}
            className={pillTab(group === state.group)}
          >
            {t(`groups.${group}`)}
          </Link>
        ))}
      </nav>

      <Card className="py-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("columns.candidate")}</TableHead>
                <TableHead>{t("columns.applied")}</TableHead>
                <TableHead>{t("columns.job")}</TableHead>
                <TableHead>{t("columns.stage")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead className="pr-4 text-right">{t("columns.score")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.applicationId}
                  data-state={row.applicationId === openId ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(href({ app: row.applicationId, cursor: state.cursor }), {
                      scroll: false,
                    })
                  }
                >
                  <TableCell className="pl-4">
                    <Link
                      href={href({ app: row.applicationId, cursor: state.cursor })}
                      scroll={false}
                      className="font-medium underline-offset-4 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {row.channel ?? t(`sources.${row.source as "entry"}`)}
                    </p>
                  </TableCell>
                  <TableCell className="text-sm">
                    {dateFormat.format(new Date(row.appliedAt))}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-sm">
                    {row.jobTitle || untitled}
                  </TableCell>
                  <TableCell className="text-sm">{t(`stages.${row.stage}`)}</TableCell>
                  <TableCell>
                    {row.outcome === "active" ? (
                      row.stage === "applied" || row.stage === "screening" ? (
                        <VerdictBadge verdict={row.verdict} />
                      ) : (
                        <Badge variant="secondary">{t("outcomes.active")}</Badge>
                      )
                    ) : (
                      <Badge variant="outline">{t(`outcomes.${row.outcome}`)}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{row.score ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {nextCursor ? (
        <Button asChild variant="outline" className="justify-self-center">
          <Link href={href({ cursor: nextCursor, app: null })}>{t("more")}</Link>
        </Button>
      ) : null}
    </div>
  );
}
