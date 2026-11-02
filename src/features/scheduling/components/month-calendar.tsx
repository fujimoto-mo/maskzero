"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toggleSlotAction } from "../actions";
import type { CalendarDay } from "../queries";

const shiftMonth = (month: string, by: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

/** The month calendar with per-slot open/close toggles and occupancy (docs/02 M8-2). */
export function MonthCalendar({
  orgSlug,
  clientSlug,
  month,
  days,
  canEdit,
}: {
  orgSlug: string;
  clientSlug: string;
  month: string;
  days: CalendarDay[];
  canEdit: boolean;
}) {
  const t = useTranslations("Scheduling.calendar");
  const names = useTranslations("Scheduling.rules").raw("weekdayNames") as string[];
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const base = `/app/${orgSlug}/${clientSlug}/scheduling`;
  const day = days.find((d) => d.date === selected);
  const lead = days[0]?.weekday ?? 0;
  const dateLabel = (d: CalendarDay) =>
    `${Number(d.date.slice(5, 7))}月${Number(d.date.slice(8))}日（${names[d.weekday]}）`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="icon" aria-label={t("prev")}>
            <Link href={`${base}?month=${shiftMonth(month, -1)}`} scroll={false}>
              <ChevronLeftIcon aria-hidden />
            </Link>
          </Button>
          <p className="font-medium">
            {Number(month.slice(0, 4))}年{Number(month.slice(5))}月
          </p>
          <Button asChild variant="ghost" size="icon" aria-label={t("next")}>
            <Link href={`${base}?month=${shiftMonth(month, 1)}`} scroll={false}>
              <ChevronRightIcon aria-hidden />
            </Link>
          </Button>
        </div>

        <div
          className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground"
          aria-hidden
        >
          {names.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {days.map((d) => {
            const open = d.slots.filter((s) => s.state === "open").length;
            const status = d.past ? t("past") : open > 0 ? t("open", { count: open }) : t("closed");
            const booked = d.booked > 0 ? t("booked", { count: d.booked }) : null;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setSelected(d.date)}
                aria-pressed={d.date === selected}
                aria-label={[dateLabel(d), d.holiday, status, booked].filter(Boolean).join(" ")}
                className={cn(
                  "grid min-h-16 content-start gap-0.5 rounded-lg border p-1.5 text-left text-xs transition-colors hover:bg-muted",
                  d.date === selected && "border-primary ring-1 ring-primary",
                  (d.weekday === 0 || d.holiday) && "text-destructive",
                  d.past && "bg-muted/40",
                )}
              >
                <span className="font-medium">{Number(d.date.slice(8))}</span>
                {d.holiday ? <span className="truncate text-[10px]">{d.holiday}</span> : null}
                <span className={open > 0 && !d.past ? "text-foreground" : "text-muted-foreground"}>
                  {status}
                </span>
                {booked ? <span className="text-primary">{booked}</span> : null}
              </button>
            );
          })}
        </div>

        <section className="grid gap-2" aria-live="polite">
          {day ? (
            <>
              <h3 className="text-sm font-medium">{t("dayTitle", { date: dateLabel(day) })}</h3>
              {canEdit && !day.past ? (
                <p className="text-xs text-muted-foreground">{t("toggleHint")}</p>
              ) : null}
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {day.slots.map((slot) => (
                  <li key={slot.startsAt}>
                    <button
                      type="button"
                      disabled={!canEdit || pending || day.past || slot.state === "booked"}
                      onClick={() =>
                        startTransition(() => toggleSlotAction(orgSlug, clientSlug, slot.startsAt))
                      }
                      aria-label={`${slot.time} ${t(slot.state === "open" ? "slotOpen" : slot.state === "booked" ? "slotBooked" : "slotClosed")}`}
                      className={cn(
                        "grid w-full gap-0.5 rounded-md border px-2 py-1.5 text-center text-sm tabular-nums transition-colors",
                        slot.state === "open" && "border-primary bg-primary/10",
                        slot.state === "closed" && "text-muted-foreground",
                        slot.state === "booked" && "bg-muted text-muted-foreground",
                      )}
                    >
                      {slot.time}
                      <span className="text-[10px]">
                        {t(
                          slot.state === "open"
                            ? "slotOpen"
                            : slot.state === "booked"
                              ? "slotBooked"
                              : "slotClosed",
                        )}
                        {slot.manual ? "・" + t("manual") : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("selectDay")}</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
