import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Verdict } from "../domain";

const STYLES: Record<Verdict, string> = {
  pending: "bg-muted text-muted-foreground",
  pass: "bg-accent text-accent-foreground",
  manual_pass: "bg-accent text-accent-foreground",
  check: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  manual_check: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  fail_pending: "border-destructive/40 bg-card text-destructive",
  fail: "bg-destructive/10 text-destructive",
  manual_fail: "bg-destructive/10 text-destructive",
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const t = useTranslations("Screening.verdicts");
  return (
    <Badge variant="outline" className={cn("h-6 border-transparent px-2.5", STYLES[verdict])}>
      {verdict === "pending" ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
      {t(verdict)}
    </Badge>
  );
}
