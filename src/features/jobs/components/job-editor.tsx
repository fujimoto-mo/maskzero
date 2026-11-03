"use client";

import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fillJobWithAiAction, saveJobAction } from "../actions";
import { checkPosting, isReadyToPost, type PostingIssue } from "../checks";
import { SECTIONS } from "../fields";
import type { PasteBoard } from "../paste";
import type { JobDetail } from "../queries";
import type { JobForm, PostingFields } from "../schema";
import { ChecksPanel } from "./checks-panel";
import { FieldRow } from "./field-row";
import { JobActions } from "./job-actions";
import { JobImages } from "./job-images";
import { PasteView } from "./paste-view";
import { JobStatusBadge } from "./status-badge";

type Tab = "edit" | "images" | PasteBoard;
const PASTE_BOARDS: PasteBoard[] = ["indeed", "engage", "other"];

/**
 * The job editor (docs/02 M2): posting fields, images, per-board paste views and live checks.
 * Edits stay in the browser until saved; checks run on every keystroke with the same rules the
 * server applies when publishing.
 */
export function JobEditor({
  orgSlug,
  clientSlug,
  job,
  canEdit,
  aiInterviewHref = null,
}: {
  orgSlug: string;
  clientSlug: string;
  job: JobDetail;
  canEdit: boolean;
  /** The job's AI interview settings, where the feature is on (docs/02 M12-1). */
  aiInterviewHref?: string | null;
}) {
  const t = useTranslations("Jobs");
  const [form, setForm] = useState<JobForm>(() => ({
    fields: job.fields,
    postingFrom: job.postingFrom,
    postingTo: job.postingTo,
    requiresCv: job.requiresCv,
  }));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(form));
  const dirty = JSON.stringify(form) !== savedSnapshot;
  const [tab, setTab] = useState<Tab>("edit");
  const [saving, startSaving] = useTransition();
  const [filling, startFilling] = useTransition();

  const issues = useMemo(
    () =>
      checkPosting(form.fields, {
        postingFrom: form.postingFrom,
        postingTo: form.postingTo,
        images: job.images,
      }),
    [form, job.images],
  );

  const setFields = (patch: Partial<PostingFields>) =>
    setForm((current) => ({ ...current, fields: { ...current.fields, ...patch } }));

  async function save(): Promise<boolean> {
    const snapshot = form;
    const result = await saveJobAction(orgSlug, clientSlug, job.id, snapshot);
    if (!result.ok) {
      toast.error(t("saveFailed"));
      return false;
    }
    setSavedSnapshot(JSON.stringify(snapshot));
    if (job.status === "published" && !isReadyToPost(result.issues)) {
      toast.warning(t("actions.demoted"));
    } else {
      toast.success(t("saved"));
    }
    return true;
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      if (canEdit && dirty && !saving) startSaving(async () => void (await save()));
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // Ask before leaving the page with unsaved edits (reloads, closing the tab).
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);

  function fillWithAi() {
    startFilling(async () => {
      const result = await fillJobWithAiAction(orgSlug, clientSlug, form.fields);
      if (!result.ok) {
        toast.error(result.error === "aiOff" ? t("ai.off") : t("ai.failed"));
        return;
      }
      if (Object.keys(result.draft).length === 0) {
        toast.info(t("ai.nothingToFill"));
        return;
      }
      setFields(result.draft);
      toast.success(t("ai.filled"));
    });
  }

  function jumpTo(issue: PostingIssue) {
    setTab(issue.section === "images" ? "images" : "edit");
    requestAnimationFrame(() =>
      document
        .getElementById(`section-${issue.section}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const title = form.fields.title?.trim() || t("untitled");

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={`/app/${orgSlug}/${clientSlug}/jobs`}>
            <ArrowLeftIcon aria-hidden />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-lg font-bold">{title}</h1>
          <JobStatusBadge status={job.status} />
          {dirty ? (
            <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
              {t("unsaved")}
            </span>
          ) : null}
        </div>
        {aiInterviewHref ? (
          <Button asChild variant="outline">
            <Link href={aiInterviewHref}>{t("aiInterview")}</Link>
          </Button>
        ) : null}
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Button
              variant={dirty ? "default" : "outline"}
              disabled={!dirty || saving}
              onClick={() => startSaving(async () => void (await save()))}
            >
              {saving ? t("saving") : t("save")}
            </Button>
            <JobActions
              orgSlug={orgSlug}
              clientSlug={clientSlug}
              jobId={job.id}
              status={job.status}
              hasApplications={job.applicationCount > 0}
              ready={isReadyToPost(issues)}
              beforePublish={() => (dirty ? save() : Promise.resolve(true))}
            />
          </div>
        ) : null}
      </div>

      {!canEdit ? (
        <Alert>
          <AlertDescription>{t("readOnly")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="min-w-0">
          <div className="-m-1 overflow-x-auto overflow-y-hidden p-1">
            <TabsList>
              <TabsTrigger value="edit">{t("tabs.edit")}</TabsTrigger>
              <TabsTrigger value="images">{t("tabs.images")}</TabsTrigger>
              {PASTE_BOARDS.map((board) => (
                <TabsTrigger key={board} value={board}>
                  {t(`tabs.${board}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="edit" className="mt-4">
            <fieldset disabled={!canEdit} className="grid gap-6">
              <Card id="section-period" className="scroll-mt-20">
                <CardHeader>
                  <CardTitle>{t("period.title")}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="postingFrom">{t("period.from")}</Label>
                        <Badge variant="secondary">{t("required")}</Badge>
                      </div>
                      <Input
                        id="postingFrom"
                        type="date"
                        value={form.postingFrom ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, postingFrom: e.target.value || null }))
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="postingTo">{t("period.to")}</Label>
                      <Input
                        id="postingTo"
                        type="date"
                        value={form.postingTo ?? ""}
                        aria-describedby="postingTo-hint"
                        onChange={(e) =>
                          setForm((f) => ({ ...f, postingTo: e.target.value || null }))
                        }
                      />
                      <p id="postingTo-hint" className="text-xs text-muted-foreground">
                        {t("period.toHint")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Switch
                      id="requiresCv"
                      checked={form.requiresCv}
                      aria-describedby="requiresCv-hint"
                      onCheckedChange={(checked) => setForm((f) => ({ ...f, requiresCv: checked }))}
                    />
                    <div className="grid gap-1">
                      <Label htmlFor="requiresCv">{t("requiresCv.label")}</Label>
                      <p id="requiresCv-hint" className="text-xs text-muted-foreground">
                        {t("requiresCv.hint")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {SECTIONS.map((section) => (
                <Card key={section.id} id={`section-${section.id}`} className="scroll-mt-20">
                  <CardHeader>
                    <CardTitle>{section.title}</CardTitle>
                    {section.id === "job" ? (
                      <CardDescription>{t("ai.hint")}</CardDescription>
                    ) : null}
                    {section.id === "job" && canEdit ? (
                      <CardAction>
                        <Button variant="outline" size="sm" disabled={filling} onClick={fillWithAi}>
                          <SparklesIcon aria-hidden />
                          {filling ? t("ai.filling") : t("ai.fill")}
                        </Button>
                      </CardAction>
                    ) : null}
                  </CardHeader>
                  <CardContent className="grid gap-6">
                    {section.fields.map((field) => (
                      <FieldRow
                        key={field.key}
                        field={field}
                        fields={form.fields}
                        onChange={setFields}
                      />
                    ))}
                  </CardContent>
                </Card>
              ))}
            </fieldset>
          </TabsContent>

          <TabsContent value="images" id="section-images" className="mt-4 scroll-mt-20">
            <JobImages
              target={{ orgSlug, clientSlug, jobId: job.id }}
              images={job.images}
              canEdit={canEdit}
            />
          </TabsContent>

          {PASTE_BOARDS.map((board) => (
            <TabsContent key={board} value={board} className="mt-4">
              <PasteView board={board} fields={form.fields} />
            </TabsContent>
          ))}
        </Tabs>

        <aside className="lg:sticky lg:top-20">
          <ChecksPanel issues={issues} onSelect={jumpTo} />
        </aside>
      </div>
    </div>
  );
}
