import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Verdict } from "../domain";

const STYLES: Record<Verdict, string> = {
  pending: "bg-muted text-muted-foreground",
  pass: "bg-emerald-600 text-white dark:bg-emerald-500",
  manual_pass: "bg-emerald-600 text-white dark:bg-emerald-500",
  check: "border-amber-500 text-amber-800 dark:text-amber-300",
  manual_check: "border-amber-500 text-amber-800 dark:text-amber-300",
  fail_pending: "border-destructive text-destructive",
  fail: "bg-destructive/10 text-destructive",
  manual_fail: "bg-destructive/10 text-destructive",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const t = useTranslations("Screening.verdicts");
  return (
    <Badge variant="outline" className={cn("border", STYLES[verdict])}>
      {verdict === "pending" ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
      {t(verdict)}
    </Badge>
  );
}
