"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { saveNotificationPrefsAction } from "../actions";
import { EMAIL_NOTIFICATION_KINDS, type EmailNotificationKind } from "../kinds";

/** Per-member choice of notifications that also arrive by email (docs/02 M6-4). */
export function NotificationPrefs({
  target,
  initial,
}: {
  target: { orgSlug: string; clientSlug: string };
  initial: EmailNotificationKind[];
}) {
  const t = useTranslations("Settings.notifications");
  const [kinds, setKinds] = useState<EmailNotificationKind[]>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = kinds.length !== initial.length || kinds.some((k) => !initial.includes(k));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <fieldset className="grid gap-3">
          <legend className="sr-only">{t("title")}</legend>
          {EMAIL_NOTIFICATION_KINDS.map((kind) => (
            <div key={kind} className="flex items-start gap-3">
              <Checkbox
                id={`notify-${kind}`}
                checked={kinds.includes(kind)}
                aria-describedby={`notify-${kind}-hint`}
                onCheckedChange={(on) =>
                  setKinds((now) => (on ? [...now, kind] : now.filter((k) => k !== kind)))
                }
              />
              <div className="grid gap-0.5">
                <Label htmlFor={`notify-${kind}`}>{t(`kinds.${kind}`)}</Label>
                <p id={`notify-${kind}-hint`} className="text-xs text-muted-foreground">
                  {t(`hints.${kind}`)}
                </p>
              </div>
            </div>
          ))}
        </fieldset>
        <Button
          className="justify-self-start"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              const result = await saveNotificationPrefsAction(
                target.orgSlug,
                target.clientSlug,
                kinds,
              );
              if (result.ok) toast.success(t("saved"));
            })
          }
        >
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
