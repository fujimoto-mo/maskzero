import { cn } from "@/lib/utils";

const RADIUS = 15;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** The 0–100 screening score as a small ring with the number inside; "—" before there is one. */
export function ScoreRing({ score, className }: { score: number | null; className?: string }) {
  if (score === null) return <span className="text-muted-foreground">—</span>;
  const share = Math.min(Math.max(score, 0), 100) / 100;
  return (
    <span className={cn("relative inline-flex size-10 items-center justify-center", className)}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={RADIUS} fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          className="stroke-brand"
        />
      </svg>
      <span className="text-xs font-semibold tabular-nums">{score}</span>
    </span>
  );
}
