import { cn } from "@/lib/utils";

/** A filter or tab link drawn as a pill; the current one is filled in ink. */
export function pillTab(active: boolean, className?: string) {
  return cn(
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm ring-1 ring-foreground/10 transition-colors hover:bg-muted",
    active && "bg-foreground font-medium text-background ring-foreground hover:bg-foreground/90",
    className,
  );
}
