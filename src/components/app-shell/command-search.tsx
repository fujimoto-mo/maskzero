"use client";

import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchCandidatesAction } from "@/features/notifications/actions";
import { cn } from "@/lib/utils";

type Result = Awaited<ReturnType<typeof searchCandidatesAction>>[number];

/** ⌘K / Ctrl+K candidate search from anywhere in the app (docs/02 M6-5). */
export function CommandSearch({ base }: { base: string }) {
  const t = useTranslations("App.search");
  const stages = useTranslations("Candidates.stages");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const latest = useRef("");
  const [orgSlug, clientSlug] = base.split("/").slice(2, 4) as [string, string];

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function search(value: string) {
    setQuery(value);
    latest.current = value;
    if (!value.trim()) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      const found = await searchCandidatesAction(orgSlug, clientSlug, value);
      // Ignore answers to queries the user has typed past.
      if (latest.current !== value) return;
      setResults(found);
      setActive(0);
    });
  }

  function go(result: Result | undefined) {
    if (!result) return;
    setOpen(false);
    router.push(`${base}/candidates?app=${result.applicationId}`);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label={t("button")}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <SearchIcon aria-hidden />
        <span className="hidden sm:inline">{t("button")}</span>
        <kbd className="hidden rounded border px-1 text-[10px] sm:inline">⌘K</kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            setResults([]);
          }
        }}
      >
        <DialogContent className="top-24 translate-y-0 gap-3 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">{t("title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("hint")}</DialogDescription>
          <Input
            autoFocus
            type="search"
            value={query}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            aria-controls="command-results"
            aria-activedescendant={
              results[active] ? `result-${results[active].applicationId}` : undefined
            }
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(results[active]);
              }
            }}
          />
          <ul
            id="command-results"
            role="listbox"
            aria-label={t("results")}
            className="grid max-h-80 gap-0.5 overflow-y-auto"
          >
            {results.map((r, i) => (
              <li
                key={r.applicationId}
                id={`result-${r.applicationId}`}
                role="option"
                aria-selected={i === active}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm",
                  i === active && "bg-muted",
                )}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
              >
                <span className="font-medium">{r.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {r.jobTitle}・{stages(r.stage as "applied")}
                </span>
              </li>
            ))}
          </ul>
          {query.trim() && !pending && results.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">{t("empty")}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
