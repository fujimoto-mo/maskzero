"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { disconnectAction, saveIntegrationSettingsAction } from "../actions";
import type { IntegrationSettings } from "../queries";

type Target = { orgSlug: string; clientSlug: string };
type Provider = "google" | "zoom" | "microsoft";

const KNOWN_ERRORS = ["denied", "demo", "unavailable", "failed"] as const;

const startHref = (target: Target, provider: Provider, purpose: "calendar" | "gmail") =>
  `/api/oauth/${provider}/start?${new URLSearchParams({
    org: target.orgSlug,
    client: target.clientSlug,
    purpose,
  })}`;

/** 設定 → 連携: Google (Calendar, Meet, Gmail), Zoom, Teams and the meeting bot (docs/02 M8-6, M9-4, M11-5). */
export function IntegrationsPanel({
  target,
  settings,
  notice,
}: {
  target: Target;
  settings: IntegrationSettings;
  notice: { connected?: string; error?: string };
}) {
  const t = useTranslations("Settings.integrations");
  const [pending, startTransition] = useTransition();
  const { can } = settings;

  function disconnect(provider: Provider) {
    if (!window.confirm(t("disconnectConfirm", { name: t(`providers.${provider}.name`) }))) return;
    startTransition(async () => {
      const result = await disconnectAction(target.orgSlug, target.clientSlug, provider);
      if (result.ok) toast.success(t("disconnected"));
      else toast.error(t("failed"));
    });
  }

  function save(form: FormData) {
    startTransition(async () => {
      const result = await saveIntegrationSettingsAction(target.orgSlug, target.clientSlug, {
        emailVia: form.get("emailVia") === "gmail" ? "gmail" : "mask0",
        botName: String(form.get("botName") ?? ""),
      });
      if (result.ok) toast.success(t("saved"));
      else toast.error(t(result.error === "gmail" ? "needsGmail" : "failed"));
    });
  }

  const rows: {
    provider: Provider;
    actions: { purpose: "calendar" | "gmail"; label: string }[];
  }[] = [
    {
      provider: "google",
      actions: [
        ...(can.googleCalendar
          ? []
          : [{ purpose: "calendar" as const, label: t("connectCalendar") }]),
        ...(can.gmail ? [] : [{ purpose: "gmail" as const, label: t("connectGmail") }]),
      ],
    },
    { provider: "zoom", actions: [{ purpose: "calendar", label: t("connect") }] },
    { provider: "microsoft", actions: [{ purpose: "calendar", label: t("connect") }] },
  ];

  return (
    <div className="grid gap-6">
      {notice.connected ? (
        <p role="status" className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          {t("connectedNotice", { name: t(`providers.${notice.connected as Provider}.name`) })}
        </p>
      ) : null}
      {notice.error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 px-4 py-3 text-sm">
          {t(`errors.${KNOWN_ERRORS.find((e) => e === notice.error) ?? "failed"}`)}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {rows.map(({ provider, actions }) => {
            const connection = settings.connections.find((c) => c.provider === provider);
            const broken = connection?.status === "error";
            // Google can add Gmail to a working Calendar connection; the others connect once.
            const buttons = !settings.available[provider]
              ? []
              : connection && !broken
                ? provider === "google"
                  ? actions
                  : []
                : broken && provider !== "google"
                  ? [{ purpose: "calendar" as const, label: t("reconnect") }]
                  : actions;
            return (
              <div
                key={provider}
                className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t(`providers.${provider}.name`)}</span>
                    {connection ? (
                      <Badge variant={broken ? "destructive" : "secondary"}>
                        {broken
                          ? t("broken")
                          : t("connectedAs", { email: connection.accountEmail })}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{t(`providers.${provider}.what`)}</p>
                  {provider === "google" && connection && !broken ? (
                    <p className="text-xs text-muted-foreground">
                      {t("googleGrants", {
                        calendar: can.googleCalendar ? "✓" : "—",
                        gmail: can.gmail ? "✓" : "—",
                      })}
                    </p>
                  ) : null}
                  {!settings.available[provider] ? (
                    <p className="text-xs text-muted-foreground">{t("unavailable")}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {buttons.map((a) => (
                    <Button key={a.purpose} asChild size="sm" variant="outline">
                      <a href={startHref(target, provider, a.purpose)}>{a.label}</a>
                    </Button>
                  ))}
                  {connection ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => disconnect(provider)}
                    >
                      {t("disconnect")}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("sendingTitle")}</CardTitle>
          <CardDescription>{t("sendingDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={save} className="grid max-w-xl gap-6">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("emailVia")}</legend>
              {(["mask0", "gmail"] as const).map((via) => (
                <label key={via} className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="emailVia"
                    value={via}
                    defaultChecked={settings.emailVia === via}
                    disabled={via === "gmail" && !can.gmail}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span className="grid gap-0.5">
                    <span>{t(`via.${via}`)}</span>
                    <span className="text-xs text-muted-foreground">{t(`via.${via}Hint`)}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="grid gap-2">
              <Label htmlFor="bot-name">{t("botName")}</Label>
              <Input
                id="bot-name"
                name="botName"
                maxLength={40}
                placeholder={t("botNamePlaceholder")}
                defaultValue={settings.botName ?? ""}
              />
              <p className="text-xs text-muted-foreground">
                {!settings.botAvailable
                  ? t("botUnavailable")
                  : settings.recordsInterviews
                    ? t("botOn")
                    : t("botOff")}
              </p>
            </div>

            <Button type="submit" disabled={pending} className="justify-self-start">
              {t("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
