"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert } from "@/components/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createOrganizationAction, type OnboardingFormState } from "../actions";

export function OnboardingForm() {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<OnboardingFormState, FormData>(
    createOrganizationAction,
    {},
  );

  return (
    <form action={formAction} className="grid gap-5">
      <FormAlert error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="companyName">{t("Onboarding.companyName")}</Label>
        <Input
          id="companyName"
          name="companyName"
          autoComplete="organization"
          placeholder={t("Onboarding.companyNamePlaceholder")}
          maxLength={100}
          required
          defaultValue={state.values?.companyName}
        />
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">{t("Onboarding.kind")}</legend>
        <RadioGroup
          name="kind"
          defaultValue={state.values?.kind ?? "inhouse"}
          className="grid gap-3"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="inhouse" id="kind-inhouse" />
            <Label htmlFor="kind-inhouse" className="font-normal">
              {t("Onboarding.kindInhouse")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="agency" id="kind-agency" />
            <Label htmlFor="kind-agency" className="font-normal">
              {t("Onboarding.kindAgency")}
            </Label>
          </div>
        </RadioGroup>
      </fieldset>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("Common.submitting") : t("Onboarding.submit")}
      </Button>
    </form>
  );
}
