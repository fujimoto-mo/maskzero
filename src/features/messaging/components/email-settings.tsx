"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  MERGE_FIELDS,
  type MergeValues,
  renderTemplate,
  validateTemplate,
} from "@/features/scheduling/templates";
import { resetTemplateAction, saveTemplateAction, setTestModeAction } from "../actions";
import type { TemplateSetting } from "../queries";

const SAMPLE: MergeValues = {
  name: "山田 花子",
  company: "株式会社サンプル",
  job: "法人営業",
  booking_url: "https://mask0.example/p/xxxx/book",
  portal_url: "https://mask0.example/p/xxxx",
  interview_at: "11月4日（水）10:00〜11:00",
  tool: "オンライン（Web会議）",
  meeting_url: "https://meet.example/abc",
};

type Target = { orgSlug: string; clientSlug: string };

/** Email templates per trigger and the company's test mode (docs/02 M9-3, M9-6). */
export function EmailSettings({
  target,
  testMode,
  templates,
}: {
  target: Target;
  testMode: boolean;
  templates: TemplateSetting[];
}) {
  const t = useTranslations("Settings.email");
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex items-start gap-3">
            <Switch
              id="test-mode"
              checked={testMode}
              disabled={pending}
              aria-describedby="test-mode-hint"
              onCheckedChange={(on) =>
                startTransition(() => setTestModeAction(target.orgSlug, target.clientSlug, on))
              }
            />
            <div className="grid gap-1">
              <Label htmlFor="test-mode">{t("testMode")}</Label>
              <p id="test-mode-hint" className="text-xs text-muted-foreground">
                {t("testModeHint")}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("quietHours")}</p>
        </CardContent>
      </Card>
      {templates.map((template) => (
        <TemplateEditor
          key={`${template.trigger}-${template.custom}`}
          target={target}
          template={template}
        />
      ))}
    </div>
  );
}

function TemplateEditor({ target, template }: { target: Target; template: TemplateSetting }) {
  const t = useTranslations("Settings.email");
  const [enabled, setEnabled] = useState(template.enabled);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [pending, startTransition] = useTransition();
  const problems = validateTemplate(template.trigger, { subject, body });
  const preview = renderTemplate({ subject, body }, SAMPLE);
  const id = `template-${template.trigger}`;
  const dirty =
    enabled !== template.enabled || subject !== template.subject || body !== template.body;

  function save() {
    startTransition(async () => {
      const result = await saveTemplateAction(target.orgSlug, target.clientSlug, {
        trigger: template.trigger,
        enabled,
        subject,
        body,
      });
      if (result.ok) toast.success(t("saved"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span id={`${id}-name`}>{t(`triggers.${template.trigger}`)}</span>
          {template.custom ? <Badge variant="outline">{t("custom")}</Badge> : null}
        </CardTitle>
        <CardAction className="flex items-center gap-2">
          <Switch
            id={`${id}-enabled`}
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-labelledby={`${id}-name ${id}-enabled-label`}
          />
          <Label id={`${id}-enabled-label`} htmlFor={`${id}-enabled`} className="font-normal">
            {t("enabled")}
          </Label>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-subject`}>{t("subject")}</Label>
            <Input
              id={`${id}-subject`}
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-body`}>{t("body")}</Label>
            <Textarea
              id={`${id}-body`}
              rows={12}
              maxLength={5000}
              value={body}
              aria-invalid={problems.length > 0 ? true : undefined}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">{t("fields")}</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {MERGE_FIELDS.map((field) => (
                <li key={field}>
                  <code className="rounded bg-muted px-1">{`{${field}}`}</code>{" "}
                  {t(`fieldNames.${field}`)}
                </li>
              ))}
            </ul>
          </details>
          <ul className="grid gap-1 text-sm text-destructive" aria-live="polite">
            {problems.map((p, i) => (
              <li key={i}>
                {p.code === "empty"
                  ? t("problems.empty")
                  : t(`problems.${p.code}`, { field: `{${p.field}}` })}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || !dirty || problems.length > 0} onClick={save}>
              {t("save")}
            </Button>
            {template.custom ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(() =>
                    resetTemplateAction(target.orgSlug, target.clientSlug, template.trigger),
                  )
                }
              >
                {t("reset")}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid content-start gap-1.5">
          <p className="text-sm font-medium">{t("preview")}</p>
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{preview.subject}</p>
            <p className="whitespace-pre-wrap">{preview.body}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
