"use client";

import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { PostingIssue } from "../checks";

/** Live pre-posting checks (docs/02 M2-3); choosing an issue jumps to its section. */
export function ChecksPanel({
  issues,
  onSelect,
}: {
  issues: PostingIssue[];
  onSelect: (issue: PostingIssue) => void;
}) {
  const t = useTranslations("Jobs.checks");
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription aria-live="polite">
          {errors.length > 0
            ? t("errorsHint")
            : warnings.length > 0
              ? t("warningsHint")
              : t("allClear")}
        </CardDescription>
      </CardHeader>
      {issues.length > 0 ? (
        <CardContent>
          <ul className="grid gap-0.5">
            {[...errors, ...warnings].map((issue, index) => (
              <li key={`${issue.code}-${issue.section}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSelect(issue)}
                  className="flex w-full gap-2 rounded-md p-1.5 text-left text-sm transition-colors hover:bg-muted"
                >
                  {issue.level === "error" ? (
                    <CircleAlertIcon
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                      aria-hidden
                    />
                  ) : (
                    <TriangleAlertIcon
                      className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500"
                      aria-hidden
                    />
                  )}
                  <span>
                    <span className="sr-only">
                      {issue.level === "error" ? t("levelError") : t("levelWarning")}:
                    </span>
                    {issue.board !== "common" ? (
                      <span className="mr-1 text-xs text-muted-foreground">
                        [{t(`boards.${issue.board}`)}]
                      </span>
                    ) : null}
                    {t(issue.code, issue.params)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
