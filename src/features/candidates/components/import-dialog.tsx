"use client";

import { FileUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/form-alert";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type ImportReport, importCsvAction } from "../actions";
import {
  type CsvCandidate,
  decodeCsv,
  detectColumns,
  hasNameColumn,
  parseCsv,
  toCandidates,
} from "../csv";

type Parsed =
  { fileName: string; candidates: CsvCandidate[]; skipped: number[] } | { error: "noName" };

/** Job-board CSV import with a five-row preview and a per-row report (docs/01 §5.6). */
export function ImportDialog({
  orgSlug,
  clientSlug,
  jobs,
}: {
  orgSlug: string;
  clientSlug: string;
  jobs: { id: string; title: string }[];
}) {
  const t = useTranslations("Candidates.import");
  const untitled = useTranslations("Jobs")("untitled");
  const fields = useTranslations("Candidates.add");
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [channel, setChannel] = useState("");
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, startTransition] = useTransition();

  async function read(file: File) {
    setReport(null);
    const rows = parseCsv(decodeCsv(new Uint8Array(await file.arrayBuffer())));
    const columns = detectColumns(rows[0] ?? []);
    if (!hasNameColumn(columns)) {
      setParsed({ error: "noName" });
      return;
    }
    setParsed({ fileName: file.name, ...toCandidates(rows, columns) });
  }

  function submit() {
    if (!parsed || "error" in parsed) return;
    startTransition(async () => {
      const result = await importCsvAction(orgSlug, clientSlug, {
        jobId,
        channel,
        fileName: parsed.fileName.slice(0, 200),
        rows: parsed.candidates,
      });
      if (!result.ok) {
        toast.error(t("error"));
        return;
      }
      setReport(result.report);
      setParsed(null);
      toast.success(t("result", { created: result.report.created }));
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setParsed(null);
          setReport(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={jobs.length === 0}>
          <FileUpIcon aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="import-job">{t("job")}</Label>
              <NativeSelect
                id="import-job"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              >
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title || untitled}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="import-channel">{t("channel")}</Label>
              <Input
                id="import-channel"
                value={channel}
                maxLength={30}
                onChange={(e) => setChannel(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="import-file">{t("file")}</Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void read(file);
              }}
            />
          </div>

          {parsed && "error" in parsed ? <FormAlert error={t("noName")} /> : null}
          {parsed && !("error" in parsed) ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">
                {t("preview", { count: parsed.candidates.length })}
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>{fields("name")}</TableHead>
                      <TableHead>{fields("email")}</TableHead>
                      <TableHead>{fields("phone")}</TableHead>
                      <TableHead>{fields("channel")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.candidates.slice(0, 5).map((c) => (
                      <TableRow key={c.row}>
                        <TableCell className="tabular-nums">{c.row}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.email ?? "—"}</TableCell>
                        <TableCell>{c.phone ?? "—"}</TableCell>
                        <TableCell>{c.channel ?? (channel || "—")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsed.skipped.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("skipped", { rows: parsed.skipped.join("・") })}
                </p>
              ) : null}
            </div>
          ) : null}

          {report ? (
            <div className="grid gap-1 rounded-lg bg-muted/50 p-3 text-sm" aria-live="polite">
              <p className="font-medium">{t("result", { created: report.created })}</p>
              {report.duplicates.length > 0 ? (
                <p>{t("duplicates", { rows: report.duplicates.join("・") })}</p>
              ) : null}
              {report.failed.length > 0 ? (
                <p className="text-destructive">
                  {t("failed", {
                    rows: report.failed
                      .map((f) => `${f.row}行目（${t(`reasons.${f.reason}`)}）`)
                      .join("、"),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={
              pending || !parsed || "error" in parsed || parsed.candidates.length === 0 || !jobId
            }
            onClick={submit}
          >
            {t("submit", { count: parsed && !("error" in parsed) ? parsed.candidates.length : 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
