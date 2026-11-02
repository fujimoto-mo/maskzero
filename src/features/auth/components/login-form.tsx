"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, type AuthFormState } from "../actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signInAction, {
    error: initialError,
  });

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
        <Label htmlFor="password">{t("Common.password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("Common.submitting") : t("Auth.login.submit")}
      </Button>
    </form>
  );
}
