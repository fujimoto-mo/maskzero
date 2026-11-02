"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies `value` to the clipboard and confirms in place for a moment. */
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useTranslations("Common");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!value}>
      {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
      <span aria-live="polite">{copied ? t("copied") : (label ?? t("copy"))}</span>
    </Button>
  );
}
