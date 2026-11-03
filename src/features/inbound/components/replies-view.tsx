"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { markReplyReadAction } from "../actions";
import type { ReplyRow } from "../queries";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

/** Candidates' replies (docs/02 M3-10, M6-4): opening one marks it read for the team. */
export function RepliesView({
  base,
  rows,
  canEdit,
}: {
  base: string;
  rows: ReplyRow[];
  canEdit: boolean;
}) {
  const t = useTranslations("Messages");
  const [, startTransition] = useTransition();
  const [orgSlug, clientSlug] = base.split("/").slice(2, 4) as [string, string];

  if (rows.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">{t("empty")}</Card>;
  }
  return (
    <ul className="grid gap-3">
      {rows.map((row) => (
        <li key={row.id}>
          <details
            className="group rounded-xl border bg-card p-4"
            onToggle={(e) => {
              if (canEdit && !row.read && (e.currentTarget as HTMLDetailsElement).open) {
                startTransition(() => markReplyReadAction(orgSlug, clientSlug, row.id));
              }
            }}
          >
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
              {!row.read ? <Badge>{t("unread")}</Badge> : null}
              <span className="font-medium">{row.candidateName}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.subject || t("noSubject")}
              </span>
              <span className="text-xs text-muted-foreground">
                {timeFormat.format(new Date(row.receivedAt))}
              </span>
            </summary>
            <div className="mt-3 grid gap-3 border-t pt-3">
              <p className="text-sm whitespace-pre-wrap">{row.body}</p>
              <Link
                href={`${base}/candidates?app=${row.applicationId}`}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {t("openCandidate")}
              </Link>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
