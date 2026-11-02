"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveEntryTemplateAction } from "../actions";
import { checkEntryTemplate, DEFAULT_ENTRY_TEMPLATE, ENTRY_TEMPLATE_MAX } from "../template";

/** The company's auto-reply text with the required {URL} (docs/02 M3-2). */
export function EntryTemplateForm({
  orgSlug,
  clientSlug,
  template,
  canEdit,
}: {
  orgSlug: string;
  clientSlug: string;
  template: string;
  canEdit: boolean;
}) {
  const t = useTranslations("Intake.template");
  const [text, setText] = useState(template);
  const [pending, startTransition] = useTransition();
  const problem = checkEntryTemplate(text);

  function save() {
    startTransition(async () => {
      const result = await saveEntryTemplateAction(orgSlug, clientSlug, text);
      if (!result.ok) toast.error(t(result.error));
      else toast.success(t("saved"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Label htmlFor="entry-template" className="sr-only">
          {t("label")}
        </Label>
        <Textarea
          id="entry-template"
          rows={6}
          value={text}
          maxLength={ENTRY_TEMPLATE_MAX}
          readOnly={!canEdit}
          aria-invalid={problem ? true : undefined}
          aria-describedby="entry-template-problem"
          onChange={(event) => setText(event.target.value)}
        />
        <p id="entry-template-problem" className="text-xs text-destructive" aria-live="polite">
          {problem ? t(problem) : null}
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || Boolean(problem) || text === template} onClick={save}>
              {t("save")}
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setText(DEFAULT_ENTRY_TEMPLATE)}
            >
              {t("reset")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("adminOnly")}</p>
        )}
      </CardContent>
    </Card>
  );
}
