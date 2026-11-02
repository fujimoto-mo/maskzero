import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Small dashboard charts in plain HTML: one hue (the brand primary) for the current period and a
// neutral for comparisons, 4px rounded data ends on the baseline, a 2px gap between bars, a native
// tooltip on every mark, and a table for screen readers. No chart library for five bar charts.

function Figure({
  title,
  description,
  table,
  children,
}: {
  title: string;
  description?: ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  return (
    <figure className="grid gap-3">
      <figcaption className="grid gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </figcaption>
      <div aria-hidden>{children}</div>
      <table className="sr-only">
        <thead>
          <tr>
            {table.head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Horizontal bars, one per category, with a note (such as last month's number) beside each. */
export function BarList({
  title,
  description,
  head,
  items,
  empty,
}: {
  title: string;
  description?: ReactNode;
  head: [string, string, string];
  items: { label: string; value: number; note: string; tooltip: string }[];
  empty: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <Figure
      title={title}
      description={description}
      table={{ head, rows: items.map((i) => [i.label, i.value, i.note]) }}
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li
              key={item.label}
              title={item.tooltip}
              className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm"
            >
              <span className="truncate">{item.label}</span>
              <span className="h-4 rounded-r-[4px] bg-muted/60">
                <span
                  className="block h-full rounded-r-[4px] bg-primary"
                  style={{ width: `${(item.value / max) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">
                {item.value}
                <span className="ml-2 text-xs text-muted-foreground">{item.note}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Figure>
  );
}

/**
 * Vertical columns over time. `compare` adds a neutral column for the earlier period, with a legend,
 * so identity never rests on color alone.
 */
export function Columns({
  title,
  description,
  head,
  items,
  legend,
}: {
  title: string;
  description?: ReactNode;
  head: string[];
  items: { label: string; short: string; value: number; compare?: number; tooltip: string }[];
  legend?: [string, string];
}) {
  const max = Math.max(1, ...items.flatMap((i) => [i.value, i.compare ?? 0]));
  return (
    <Figure
      title={title}
      description={
        <>
          {description}
          {legend ? (
            <span className="ml-1 inline-flex items-center gap-3 align-middle">
              <span className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-[2px] bg-primary" /> {legend[0]}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-[2px] bg-muted-foreground/40" /> {legend[1]}
              </span>
            </span>
          ) : null}
        </>
      }
      table={{
        head,
        rows: items.map((i) =>
          i.compare === undefined ? [i.label, i.value] : [i.label, i.value, i.compare],
        ),
      }}
    >
      <div className="grid gap-1">
        <div className="flex h-32 items-end gap-[2px] border-b border-border">
          {items.map((item) => (
            <div
              key={item.label}
              title={item.tooltip}
              className="flex h-full flex-1 items-end justify-center gap-[2px]"
            >
              {item.compare !== undefined ? (
                <span
                  className="w-full max-w-3 rounded-t-[4px] bg-muted-foreground/40"
                  style={{ height: `${(item.compare / max) * 100}%` }}
                />
              ) : null}
              <span
                className={cn(
                  "w-full rounded-t-[4px] bg-primary",
                  item.compare !== undefined ? "max-w-3" : "max-w-6",
                )}
                style={{ height: `${(item.value / max) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-[2px] text-[10px] text-muted-foreground">
          {items.map((item) => (
            <span key={item.label} className="flex-1 truncate text-center tabular-nums">
              {item.short}
            </span>
          ))}
        </div>
      </div>
    </Figure>
  );
}

/** The selection funnel: each step's count and its conversion from the step before. */
export function Funnel({
  title,
  description,
  head,
  steps,
}: {
  title: string;
  description?: ReactNode;
  head: [string, string, string];
  steps: { label: string; count: number }[];
}) {
  const max = Math.max(1, steps[0]?.count ?? 0);
  const rate = (i: number) => {
    const before = steps[i - 1]?.count ?? 0;
    return i === 0 || before === 0 ? "—" : `${Math.round((steps[i]!.count / before) * 100)}%`;
  };
  return (
    <Figure
      title={title}
      description={description}
      table={{ head, rows: steps.map((s, i) => [s.label, s.count, rate(i)]) }}
    >
      <ol className="grid gap-2">
        {steps.map((step, i) => (
          <li
            key={step.label}
            title={`${step.label}: ${step.count}（${rate(i)}）`}
            className="grid grid-cols-[6rem_1fr_5rem] items-center gap-3 text-sm"
          >
            <span>{step.label}</span>
            <span className="h-5 rounded-r-[4px] bg-muted/60">
              <span
                className="block h-full rounded-r-[4px] bg-primary"
                style={{ width: `${(step.count / max) * 100}%` }}
              />
            </span>
            <span className="text-right tabular-nums">
              {step.count}
              <span className="ml-2 text-xs text-muted-foreground">{rate(i)}</span>
            </span>
          </li>
        ))}
      </ol>
    </Figure>
  );
}
