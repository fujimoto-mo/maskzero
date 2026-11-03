"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Turnstile, turnstileSiteKey } from "@/components/turnstile";
import { Button } from "@/components/ui/button";

type View = "admin" | "candidate";
const ERRORS = ["rateLimited", "busy", "signedIn", "challenge"] as const;

/** Creates (or reopens) the visitor's sandbox, then loads it with a full page load. */
export function DemoStart() {
  const t = useTranslations("Demo.start");
  const [pending, setPending] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  async function start(view: View) {
    setPending(view);
    setError(null);
    try {
      const response = await fetch("/api/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ view, turnstileToken: token ?? undefined }),
      });
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (response.ok && body.url) {
        // A full load, so the new session's cookies apply everywhere.
        window.location.assign(body.url);
        return;
      }
      const known = ERRORS.find((e) => e === body.error);
      setError(t(`errors.${known ?? "failed"}`));
    } catch {
      setError(t("errors.failed"));
    }
    setToken(null);
    setAttempt((a) => a + 1);
    setPending(null);
  }

  const blocked = pending !== null || (turnstileSiteKey !== null && !token);
  return (
    <section aria-labelledby="demo-start" className="grid gap-4">
      <h2 id="demo-start" className="text-lg font-bold">
        {t("title")}
      </h2>
      <p className="text-[15px] leading-7 text-muted-foreground">{t("body")}</p>
      <Turnstile key={attempt} action="demo" onToken={setToken} />
      <FormAlert error={error ?? undefined} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Button size="lg" className="h-12" disabled={blocked} onClick={() => start("admin")}>
          {pending === "admin" ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : null}
          {pending === "admin" ? t("preparing") : t("admin")}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12"
          disabled={blocked}
          onClick={() => start("candidate")}
        >
          {pending === "candidate" ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden />
          ) : null}
          {pending === "candidate" ? t("preparing") : t("candidate")}
        </Button>
      </div>
    </section>
  );
}
