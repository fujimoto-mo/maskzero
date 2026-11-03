"use client";

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveAiConfigAction } from "../actions";
import {
  type AiConfigInput,
  configSchema,
  MAX_FOLLOW_UPS,
  MAX_QUESTIONS,
  type Question,
  SAMPLE_QUESTIONS,
} from "../domain";

/** A job's AI interview: round 1 by chat, its questions and their guidance (docs/02 M12-1). */
export function AiConfigEditor({
  orgSlug,
  clientSlug,
  jobId,
  initial,
  canEdit,
}: {
  orgSlug: string;
  clientSlug: string;
  jobId: string;
  initial: AiConfigInput;
  canEdit: boolean;
}) {
  const t = useTranslations("AiReview.config");
  const [config, setConfig] = useState(initial);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<AiConfigInput>) => setConfig((c) => ({ ...c, ...patch }));
  const setQuestion = (index: number, patch: Partial<Question>) =>
    set({ questions: config.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)) });
  const move = (index: number, by: -1 | 1) => {
    const list = [...config.questions];
    const [item] = list.splice(index, 1);
    list.splice(index + by, 0, item!);
    set({ questions: list });
  };
  const valid = configSchema.safeParse(config).success;
  const missing = config.enabled && config.questions.length === 0;

  function save() {
    startTransition(async () => {
      const result = await saveAiConfigAction(orgSlug, clientSlug, jobId, config);
      if (result.ok) toast.success(t("saved"));
      else toast.error(t("invalid"));
    });
  }

  return (
    <fieldset disabled={!canEdit} className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-start gap-3">
            <Switch
              id="ai-enabled"
              checked={config.enabled}
              onCheckedChange={(enabled) => set({ enabled })}
              aria-describedby="ai-enabled-hint"
            />
            <div className="grid gap-1">
              <Label htmlFor="ai-enabled">{t("enabled")}</Label>
              <p id="ai-enabled-hint" className="text-xs text-muted-foreground">
                {t("enabledHint")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="ai-time">{t("timeLimit")}</Label>
              <Input
                id="ai-time"
                type="number"
                min={10}
                max={90}
                className="w-28"
                value={config.timeLimitMinutes}
                onChange={(e) => set({ timeLimitMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ai-deadline">{t("deadlineDays")}</Label>
              <Input
                id="ai-deadline"
                type="number"
                min={2}
                max={14}
                className="w-28"
                value={config.deadlineDays}
                onChange={(e) => set({ deadlineDays: Number(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("questionsTitle")}</CardTitle>
          <CardDescription>{t("questionsDescription", { max: MAX_QUESTIONS })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {config.questions.length === 0 ? (
            <div className="grid justify-items-start gap-2">
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
              <Button
                variant="outline"
                onClick={() =>
                  set({
                    questions: SAMPLE_QUESTIONS.map((q) => ({ ...q, id: crypto.randomUUID() })),
                  })
                }
              >
                {t("useSamples")}
              </Button>
            </div>
          ) : null}
          <ol className="grid gap-3">
            {config.questions.map((q, index) => (
              <li key={q.id} className="grid gap-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t("number", { n: index + 1 })}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("up")}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUpIcon aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("down")}
                      disabled={index === config.questions.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDownIcon aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove")}
                      onClick={() => set({ questions: config.questions.filter((x) => x !== q) })}
                    >
                      <Trash2Icon aria-hidden />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`q-${q.id}`}>{t("question")}</Label>
                  <Textarea
                    id={`q-${q.id}`}
                    rows={2}
                    maxLength={300}
                    value={q.text}
                    onChange={(e) => setQuestion(index, { text: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`r-${q.id}`}>{t("rubric")}</Label>
                  <Textarea
                    id={`r-${q.id}`}
                    rows={2}
                    maxLength={500}
                    placeholder={t("rubricPlaceholder")}
                    value={q.rubric}
                    onChange={(e) => setQuestion(index, { rubric: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`f-${q.id}`}>{t("followUps")}</Label>
                  <NativeSelect
                    id={`f-${q.id}`}
                    className="w-32"
                    value={String(q.followUps)}
                    onChange={(e) => setQuestion(index, { followUps: Number(e.target.value) })}
                  >
                    {Array.from({ length: MAX_FOLLOW_UPS + 1 }, (_, n) => (
                      <option key={n} value={n}>
                        {t("followUpCount", { n })}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </li>
            ))}
          </ol>
          {config.questions.length < MAX_QUESTIONS ? (
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() =>
                set({
                  questions: [
                    ...config.questions,
                    { id: crypto.randomUUID(), text: "", rubric: "", followUps: 1 },
                  ],
                })
              }
            >
              <PlusIcon aria-hidden />
              {t("add")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription>{t("fairness")}</AlertDescription>
      </Alert>
      {missing ? <p className="text-sm text-destructive">{t("needQuestions")}</p> : null}
      {canEdit ? (
        <Button
          className="justify-self-start"
          disabled={pending || !valid || missing}
          onClick={save}
        >
          {pending ? t("saving") : t("save")}
        </Button>
      ) : null}
    </fieldset>
  );
}
