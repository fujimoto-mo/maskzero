"use client";

import { CheckCircle2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatSlot } from "@/features/scheduling/slots";
import { cn } from "@/lib/utils";

export type SlotDay = {
  date: string;
  label: string;
  slots: { startsAt: string; endsAt: string; time: string }[];
};

const MAX_PICKS = 3;
const INITIAL_DAYS = 10;

/** The booking page (docs/02 M8-3): up to three preferred slots in order, concerns, a memo. */
export function BookingForm({
  token,
  days,
  concerns,
  pendingNote,
}: {
  token: string;
  days: SlotDay[];
  concerns: { id: string; label: string; answer: string }[];
  pendingNote: boolean;
}) {
  const t = useTranslations("Booking");
  const router = useRouter();
  const [picks, setPicks] = useState<{ startsAt: string; endsAt: string }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  const [shownDays, setShownDays] = useState(INITIAL_DAYS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<
    { kind: "confirmed"; slot: string } | { kind: "pending" } | null
  >(null);

  function toggle(slot: { startsAt: string; endsAt: string }) {
    setPicks((current) =>
      current.some((p) => p.startsAt === slot.startsAt)
        ? current.filter((p) => p.startsAt !== slot.startsAt)
        : current.length < MAX_PICKS
          ? [...current, slot]
          : current,
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/p/${token}/book`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slots: picks, concernIds: chosen, memo }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
        slot?: { startsAt: string; endsAt: string };
      };
      if (response.ok && body.status === "confirmed" && body.slot) {
        setDone({
          kind: "confirmed",
          slot: formatSlot({
            startsAt: new Date(body.slot.startsAt),
            endsAt: new Date(body.slot.endsAt),
          }),
        });
      } else if (response.ok && body.status === "pending") {
        setDone({ kind: "pending" });
      } else if (response.ok && body.status === "unmatched") {
        setError(t("unmatched"));
        setPicks([]);
        router.refresh();
      } else {
        setError(body.error === "closed" ? t("closed") : t("error"));
      }
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border bg-card p-6 text-center">
        <CheckCircle2Icon className="size-10 text-primary" aria-hidden />
        <h2 className="text-lg font-bold">
          {done.kind === "confirmed" ? t("confirmedTitle") : t("pendingTitle")}
        </h2>
        {done.kind === "confirmed" ? <p className="text-base font-medium">{done.slot}</p> : null}
        <p className="text-sm">
          {done.kind === "confirmed" ? t("confirmedBody") : t("pendingBody")}
        </p>
        <Button asChild variant="outline">
          <Link href={`/p/${token}`}>{t("portal")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      {pendingNote ? (
        <p className="rounded-lg bg-muted/60 p-3 text-sm">{t("pendingNote")}</p>
      ) : null}
      <section className="grid gap-3" aria-labelledby="pick-title">
        <div className="grid gap-1">
          <h2 id="pick-title" className="font-medium">
            {t("pick")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("pickHint")}</p>
        </div>
        {days.length === 0 ? (
          <p className="text-sm">{t("noSlots")}</p>
        ) : (
          <ul className="grid gap-3">
            {days.slice(0, shownDays).map((day) => (
              <li key={day.date} className="grid gap-2 rounded-xl border bg-card p-3">
                <p id={`day-${day.date}`} className="text-sm font-medium">
                  {day.label}
                </p>
                <div
                  role="group"
                  aria-labelledby={`day-${day.date}`}
                  className="flex flex-wrap gap-2"
                >
                  {day.slots.map((slot) => {
                    const rank = picks.findIndex((p) => p.startsAt === slot.startsAt);
                    return (
                      <button
                        key={slot.startsAt}
                        type="button"
                        aria-pressed={rank >= 0}
                        disabled={rank < 0 && picks.length >= MAX_PICKS}
                        onClick={() => toggle(slot)}
                        className={cn(
                          "min-h-11 min-w-20 rounded-lg border px-3 text-sm tabular-nums transition-colors disabled:opacity-40",
                          rank >= 0
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-muted",
                        )}
                      >
                        {slot.time}
                        {rank >= 0 ? (
                          <span className="block text-[10px]">{t("picked", { n: rank + 1 })}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
        {shownDays < days.length ? (
          <Button variant="ghost" onClick={() => setShownDays((n) => n + INITIAL_DAYS)}>
            {t("moreDays")}
          </Button>
        ) : null}
      </section>

      {concerns.length > 0 ? (
        <fieldset className="grid gap-2 rounded-xl border bg-card p-4">
          <legend className="px-1 text-sm font-medium">{t("concerns")}</legend>
          <p className="text-xs text-muted-foreground">{t("concernsHint")}</p>
          {concerns.map((concern) => {
            const checked = chosen.includes(concern.id);
            return (
              <div key={concern.id} className="grid gap-1">
                <Label className="items-start font-normal">
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    onCheckedChange={(on) =>
                      setChosen((list) =>
                        on ? [...list, concern.id] : list.filter((id) => id !== concern.id),
                      )
                    }
                  />
                  {concern.label}
                </Label>
                {checked ? (
                  <p className="ml-6 rounded-md bg-muted/60 p-2 text-sm whitespace-pre-wrap">
                    {concern.answer}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="booking-memo">{t("memo")}</Label>
        <Textarea
          id="booking-memo"
          rows={3}
          maxLength={500}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </div>

      <FormAlert error={error ?? undefined} />
      <Button size="lg" className="h-11" disabled={busy || picks.length === 0} onClick={submit}>
        {busy ? t("sending") : t("submit")}
      </Button>
    </div>
  );
}
