"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordResetAction, type AuthFormState } from "../actions";

export function ForgotPasswordForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert error={state.error} message={state.message} />
      <div className="grid gap-2">
        <Label htmlFor="email">{t("Common.email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
        />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("Common.submitting") : t("Auth.forgot.submit")}
      </Button>
    </form>
  );
}
