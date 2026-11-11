import { Building2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The big call-to-action button on candidate pages (with `<Button size="lg">`). */
export const CANDIDATE_CTA = "h-12 rounded-xl text-base";

/** A candidate page's heading: bold, with the brand bar on its left. */
export function candidateHeading(size: "text-lg" | "text-xl") {
  return cn("border-l-4 border-brand pl-3 leading-snug font-bold", size);
}

/** Top of the candidate pages: the hiring company, and what the page is for on the right. */
export function CandidateHeader({ company, label }: { company: string; label?: string }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b pb-3">
      <p className="flex min-w-0 items-center gap-2 font-semibold">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-4"
        >
          <Building2Icon />
        </span>
        <span className="truncate">{company}</span>
      </p>
      {label ? <p className="shrink-0 text-xs text-muted-foreground">{label}</p> : null}
    </header>
  );
}
