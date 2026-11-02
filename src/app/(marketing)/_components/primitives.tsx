import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>
  );
}

const toneClasses = {
  plain: "",
  muted: "bg-muted/40",
  accent: "bg-accent/50",
} as const;

export type SectionTone = keyof typeof toneClasses;

/** Eyebrow, h2 and lead shared by every landing-page section. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "center",
  className,
}: {
  id: string;
  eyebrow?: ReactNode;
  title: string;
  lead?: string;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <div className={cn("max-w-3xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? (
        <p
          className={cn(
            "flex flex-wrap items-center gap-2 text-sm font-semibold text-primary",
            align === "center" && "justify-center",
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className="mt-3 text-2xl leading-snug font-bold tracking-tight text-balance [word-break:auto-phrase] sm:text-3xl"
      >
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          {lead}
        </p>
      ) : null}
    </div>
  );
}

/** A landing-page section: anchor target, labelled by its own h2. */
export function Section({
  id,
  eyebrow,
  title,
  lead,
  tone = "plain",
  align,
  className,
  children,
}: {
  id: string;
  eyebrow?: ReactNode;
  title: string;
  lead?: string;
  tone?: SectionTone;
  align?: "center" | "start";
  className?: string;
  children?: ReactNode;
}) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-16 py-16 sm:py-20", toneClasses[tone], className)}
    >
      <Container>
        <SectionHeading id={headingId} eyebrow={eyebrow} title={title} lead={lead} align={align} />
        {children}
      </Container>
    </section>
  );
}

/** "Coming later" label for features that aren't available yet. Renders nothing for "". */
export function StatusBadge({ label, className }: { label: string; className?: string }) {
  if (!label) return null;
  return (
    <Badge
      variant="outline"
      className={cn("border-primary/30 bg-background font-medium text-primary", className)}
    >
      {label}
    </Badge>
  );
}

/** Two-digit step number ("01"). */
export function stepNumber(index: number) {
  return String(index + 1).padStart(2, "0");
}
