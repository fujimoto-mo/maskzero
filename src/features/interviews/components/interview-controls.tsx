"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Reschedule (before the cutoff) and withdraw, on the personal page (docs/02 M8-5). */
export function InterviewControls({
  token,
  canReschedule,
}: {
  token: string;
  canReschedule: boolean;
}) {
  const t = useTranslations("Portal");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(action: "reschedule" | "withdraw") {
    setBusy(true);
    try {
      const response = await fetch(`/api/p/${token}/interview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        toast.error(t("changeFailed"));
        return;
      }
      if (action === "reschedule") {
        // A full load on purpose: Next keeps a visited booking page mounted, with its "booked"
        // state, and router.push() would show that again (CLAUDE.md, sign-out does the same).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/p/${token}/book`);
      } else {
        toast.success(t("withdrawn"));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canReschedule ? (
        <Button variant="outline" disabled={busy} onClick={() => void change("reschedule")}>
          {t("reschedule")}
        </Button>
      ) : null}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" className="text-destructive" disabled={busy}>
            {t("withdraw")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("withdrawTitle")}</DialogTitle>
            <DialogDescription>{t("withdrawBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" disabled={busy} onClick={() => void change("withdraw")}>
              {t("withdrawConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
