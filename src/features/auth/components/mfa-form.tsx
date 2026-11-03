"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Enrollment, startTotpEnrollmentAction, verifyTotpAction } from "../mfa";

/**
 * The second sign-in step, or adding an authenticator app (docs/02 M1-6). `factorId` set means
 * the user already has an app and only enters a code.
 */
export function MfaForm({
  factorId,
  next,
  required,
}: {
  factorId: string | null;
  next: string;
  required: boolean;
}) {
  const t = useTranslations("Mfa");
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const challenge = factorId !== null;
  const activeFactor = factorId ?? enrollment?.factorId ?? null;

  function begin() {
    setError(null);
    startTransition(async () => {
      const result = await startTotpEnrollmentAction();
      if (result) setEnrollment(result);
      else setError(t("enrollFailed"));
    });
  }

  function verify(form: FormData) {
    if (!activeFactor) return;
    setError(null);
    startTransition(async () => {
      const result = await verifyTotpAction({
        factorId: activeFactor,
        code: String(form.get("code") ?? "").replace(/\s/g, ""),
        next,
      });
      // Success redirects; only a wrong or expired code comes back.
      if (!result.ok) setError(t("wrongCode"));
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{challenge ? t("challengeTitle") : t("enrollTitle")}</CardTitle>
        <CardDescription>
          {challenge ? t("challengeLead") : required ? t("requiredLead") : t("enrollLead")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!challenge && !enrollment ? (
          <Button onClick={begin} disabled={pending}>
            {t("start")}
          </Button>
        ) : null}
        {enrollment ? (
          <div className="grid justify-items-center gap-3">
            <p className="text-sm">{t("scan")}</p>
            {/* An SVG data URI from Supabase; next/image adds nothing for it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qrCode}
              alt={t("qrAlt")}
              width={180}
              height={180}
              className="rounded-lg bg-white p-2"
            />
            <p className="text-xs text-muted-foreground">{t("secretLabel")}</p>
            <code
              className="rounded bg-muted px-2 py-1 text-xs break-all"
              data-testid="totp-secret"
            >
              {enrollment.secret}
            </code>
          </div>
        ) : null}
        {activeFactor ? (
          <form action={verify} className="grid gap-2">
            <Label htmlFor="mfa-code">{t("code")}</Label>
            <Input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "mfa-error" : undefined}
            />
            <Button type="submit" disabled={pending}>
              {t("verify")}
            </Button>
          </form>
        ) : null}
        {error ? (
          <p id="mfa-error" role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
