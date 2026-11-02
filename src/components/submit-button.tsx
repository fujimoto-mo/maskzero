"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button for Server Component forms: disabled with a "sending" label while pending. */
export function SubmitButton({ children, ...props }: ComponentProps<typeof Button>) {
  const t = useTranslations("Common");
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? t("submitting") : children}
    </Button>
  );
}
