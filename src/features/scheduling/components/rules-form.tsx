"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { saveRulesAction } from "../actions";
import type { Capabilities, InterviewTool } from "@/features/integrations/domain";
import type { RulesRow } from "../server";

type Mode = "common" | "custom" | "off";
type Day = { mode: Mode; from: string; to: string };

const WEEKDAYS = ["0", "1", "2", "3", "4", "5", "6"] as const;
const TOOLS = ["url", "meet", "zoom", "teams", "onsite"] as const satisfies InterviewTool[];
const NEEDS: Record<InterviewTool, keyof Capabilities | null> = {
  url: null,
  onsite: null,
  meet: "googleCalendar",
  zoom: "zoom",
  teams: "teams",
};

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[14rem_1fr] sm:items-center">
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Availability rules (docs/02 M8-1, M8-4, M8-5, M8-6). */
export function RulesForm({
  orgSlug,
  clientSlug,
  rules,
  canEdit,
  can,
  googleCalendarId,
}: {
  orgSlug: string;
  clientSlug: string;
  rules: RulesRow;
  canEdit: boolean;
  can: Capabilities;
  googleCalendarId: string | null;
}) {
  const t = useTranslations("Scheduling.rules");
  const names = t.raw("weekdayNames") as string[];
  const [form, setForm] = useState({
    commonFrom: rules.commonFrom,
    commonTo: rules.commonTo,
    slotMinutes: rules.slotMinutes,
    laterRoundMinutes: rules.laterRoundMinutes,
    bufferMinutes: rules.bufferMinutes,
    excludeWeekends: rules.excludeWeekends,
    excludeHolidays: rules.excludeHolidays,
    windowDays: rules.windowDays,
    minNoticeHours: rules.minNoticeHours,
    cancelCutoffHours: rules.cancelCutoffHours,
    confirmMode: rules.confirmMode,
    tool: rules.tool as InterviewTool,
    linkGoogle: googleCalendarId !== null,
    googleCalendarId: googleCalendarId === "primary" ? "" : (googleCalendarId ?? ""),
    fixedMeetingUrl: rules.fixedMeetingUrl ?? "",
    onsiteAddress: rules.onsiteAddress ?? "",
  });
  const [days, setDays] = useState<Record<string, Day>>(() =>
    Object.fromEntries(
      WEEKDAYS.map((d) => {
        const entry = rules.weekly[d];
        const mode: Mode = !entry ? "common" : entry.on ? "custom" : "off";
        return [
          d,
          { mode, from: entry?.from ?? rules.commonFrom, to: entry?.to ?? rules.commonTo },
        ];
      }),
    ),
  );
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const number = (value: string) => Math.max(0, Math.round(Number(value) || 0));

  function save() {
    const weekly = Object.fromEntries(
      WEEKDAYS.flatMap((d) => {
        const day = days[d]!;
        if (day.mode === "common") return [];
        return [[d, { on: day.mode === "custom", from: day.from, to: day.to }]];
      }),
    );
    startTransition(async () => {
      const { linkGoogle, googleCalendarId: calendarId, ...rest } = form;
      const result = await saveRulesAction(orgSlug, clientSlug, {
        ...rest,
        weekly,
        googleCalendarId: linkGoogle ? calendarId.trim() : null,
      });
      if (result.ok) toast.success(t("saved"));
      else toast.error(t(result.field === "tool" ? "toolUnavailable" : "invalid"));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <fieldset disabled={!canEdit} className="grid gap-5">
          <Row label={t("commonHours")} htmlFor="commonFrom">
            <Input
              id="commonFrom"
              type="time"
              step={900}
              className="w-32"
              value={form.commonFrom}
              onChange={(e) => set({ commonFrom: e.target.value })}
            />
            <span aria-hidden>〜</span>
            <Input
              type="time"
              step={900}
              aria-label={`${t("commonHours")}（終了）`}
              className="w-32"
              value={form.commonTo}
              onChange={(e) => set({ commonTo: e.target.value })}
            />
          </Row>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("weekdays")}</legend>
            {WEEKDAYS.map((d) => {
              const day = days[d]!;
              const update = (patch: Partial<Day>) =>
                setDays((all) => ({ ...all, [d]: { ...day, ...patch } }));
              return (
                <div key={d} className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-sm">{names[Number(d)]}</span>
                  <NativeSelect
                    aria-label={`${names[Number(d)]}曜日`}
                    className="w-40"
                    value={day.mode}
                    onChange={(e) => update({ mode: e.target.value as Mode })}
                  >
                    {(["common", "custom", "off"] as const).map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`weekdayMode.${mode}`)}
                      </option>
                    ))}
                  </NativeSelect>
                  {day.mode === "custom" ? (
                    <>
                      <Input
                        type="time"
                        step={900}
                        aria-label={`${names[Number(d)]}曜日の開始`}
                        className="w-32"
                        value={day.from}
                        onChange={(e) => update({ from: e.target.value })}
                      />
                      <span aria-hidden>〜</span>
                      <Input
                        type="time"
                        step={900}
                        aria-label={`${names[Number(d)]}曜日の終了`}
                        className="w-32"
                        value={day.to}
                        onChange={(e) => update({ to: e.target.value })}
                      />
                    </>
                  ) : null}
                </div>
              );
            })}
          </fieldset>

          <Row label={t("excludeWeekends")} htmlFor="excludeWeekends">
            <Switch
              id="excludeWeekends"
              checked={form.excludeWeekends}
              onCheckedChange={(v) => set({ excludeWeekends: v })}
            />
          </Row>
          <Row label={t("excludeHolidays")} htmlFor="excludeHolidays">
            <Switch
              id="excludeHolidays"
              checked={form.excludeHolidays}
              onCheckedChange={(v) => set({ excludeHolidays: v })}
            />
          </Row>

          {(
            [
              ["slotMinutes", [30, 45, 60, 90, 120], t("minutes")],
              ["laterRoundMinutes", [30, 45, 60, 90, 120], t("minutes")],
              ["bufferMinutes", [0, 10, 15, 30, 60], t("minutes")],
            ] as const
          ).map(([key, options, unit]) => (
            <Row key={key} label={t(key)} htmlFor={key}>
              <NativeSelect
                id={key}
                className="w-28"
                value={String(form[key])}
                onChange={(e) => set({ [key]: Number(e.target.value) })}
              >
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </NativeSelect>
              <span className="text-sm">{unit}</span>
            </Row>
          ))}

          {(
            [
              ["windowDays", t("days")],
              ["minNoticeHours", t("hoursBefore")],
              ["cancelCutoffHours", t("hoursBefore")],
            ] as const
          ).map(([key, unit]) => (
            <Row key={key} label={t(key)} htmlFor={key}>
              <Input
                id={key}
                type="number"
                min={0}
                className="w-24"
                value={form[key]}
                onChange={(e) => set({ [key]: number(e.target.value) })}
              />
              <span className="text-sm">{unit}</span>
            </Row>
          ))}

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t("confirmMode")}</legend>
            <RadioGroup
              value={form.confirmMode}
              onValueChange={(v) => set({ confirmMode: v as "auto" | "manual" })}
              className="grid gap-2"
            >
              {(["auto", "manual"] as const).map((mode) => (
                <Label key={mode} className="font-normal">
                  <RadioGroupItem value={mode} />
                  {t(mode)}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">{t("tool")}</legend>
            <RadioGroup
              value={form.tool}
              onValueChange={(v) => set({ tool: v as InterviewTool })}
              className="grid gap-2"
            >
              {TOOLS.map((tool) => {
                const need = NEEDS[tool];
                // A tool chosen before its account was disconnected stays visible as chosen.
                const off = need !== null && !can[need] && form.tool !== tool;
                return (
                  <Label key={tool} className="font-normal">
                    <RadioGroupItem value={tool} disabled={off} />
                    {t(tool)}
                    {off ? (
                      <span className="text-xs text-muted-foreground">{t("toolNeeds")}</span>
                    ) : null}
                  </Label>
                );
              })}
            </RadioGroup>
            {form.tool === "meet" || form.tool === "zoom" || form.tool === "teams" ? (
              <p className="max-w-xl text-xs text-muted-foreground">{t("generatedHint")}</p>
            ) : form.tool === "url" ? (
              <div className="grid max-w-xl gap-2">
                <Label htmlFor="fixedMeetingUrl">{t("meetingUrl")}</Label>
                <Input
                  id="fixedMeetingUrl"
                  type="url"
                  placeholder="https://"
                  value={form.fixedMeetingUrl}
                  onChange={(e) => set({ fixedMeetingUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("meetingUrlHint")}</p>
              </div>
            ) : (
              <div className="grid max-w-xl gap-2">
                <Label htmlFor="onsiteAddress">{t("address")}</Label>
                <Input
                  id="onsiteAddress"
                  maxLength={200}
                  value={form.onsiteAddress}
                  onChange={(e) => set({ onsiteAddress: e.target.value })}
                />
              </div>
            )}
          </fieldset>

          <fieldset className="grid gap-3">
            <legend className="sr-only">{t("googleCalendar")}</legend>
            <div className="flex items-start gap-3">
              <Switch
                id="linkGoogle"
                checked={form.linkGoogle}
                disabled={!can.googleCalendar && !form.linkGoogle}
                onCheckedChange={(v) => set({ linkGoogle: v })}
                aria-describedby="linkGoogle-hint"
              />
              <div className="grid gap-1">
                <Label htmlFor="linkGoogle">{t("googleCalendar")}</Label>
                <p id="linkGoogle-hint" className="max-w-xl text-xs text-muted-foreground">
                  {can.googleCalendar ? t("googleCalendarHint") : t("googleNotConnected")}
                </p>
              </div>
            </div>
            {form.linkGoogle ? (
              <div className="grid max-w-xl gap-2">
                <Label htmlFor="googleCalendarId">{t("googleCalendarId")}</Label>
                <Input
                  id="googleCalendarId"
                  placeholder="primary"
                  maxLength={400}
                  value={form.googleCalendarId}
                  onChange={(e) => set({ googleCalendarId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">{t("googleCalendarIdHint")}</p>
              </div>
            ) : null}
          </fieldset>

          {canEdit ? (
            <Button className="justify-self-start" disabled={pending} onClick={save}>
              {t("save")}
            </Button>
          ) : null}
        </fieldset>
      </CardContent>
    </Card>
  );
}
