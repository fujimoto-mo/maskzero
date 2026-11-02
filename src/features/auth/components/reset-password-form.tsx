"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordAction, type AuthFormState } from "../actions";

export function ResetPasswordForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    updatePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="password">
          {t("Common.password")}
          <span className="text-xs font-normal text-muted-foreground">
            {t("Auth.signup.passwordHint")}
          </span>
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("Common.submitting") : t("Auth.reset.submit")}
      </Button>
    </form>
  );
}
