"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** One click to stop (or restart) suggestions of other jobs (docs/02 M5-6). */
export function ConsentToggle({
  token,
  initial,
  kind = "otherJobs",
}: {
  token: string;
  initial: boolean;
  kind?: "otherJobs" | "recording";
}) {
  const t = useTranslations(kind === "recording" ? "Consent.recording" : "Consent");
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    startTransition(async () => {
      const response = await fetch(`/api/p/${token}/consent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [kind]: next }),
      });
      if (!response.ok) {
        toast.error(t("failed"));
        return;
      }
      setOn(next);
      toast.success(next ? t("started") : t("stopped"));
    });
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm" aria-live="polite">
        {on ? t("statusOn") : t("statusOff")}
      </p>
      <Button
        variant={on ? "outline" : "default"}
        className="justify-self-start"
        disabled={pending}
        onClick={() => change(!on)}
      >
        {on ? t("stop") : t("start")}
      </Button>
    </div>
  );
}
