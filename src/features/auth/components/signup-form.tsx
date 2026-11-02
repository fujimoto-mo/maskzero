"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type AuthFormState } from "../actions";

export function SignupForm({ next }: { next: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUpAction, {});

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="next" value={next} />
      <FormAlert error={state.error} />
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
        {pending ? t("Common.submitting") : t("Auth.signup.submit")}
      </Button>
    </form>
  );
}
