"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type PasteBoard, pasteGroups } from "../paste";
import type { PostingFields } from "../schema";

/** The posting in a board's own form order, one copy button per input (docs/02 M2-5). */
export function PasteView({ board, fields }: { board: PasteBoard; fields: PostingFields }) {
  const t = useTranslations("Jobs");

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {board === "other"
          ? t("paste.introOther")
          : t("paste.intro", { board: t(`tabs.${board}`) })}
      </p>
      {pasteGroups(board, fields).map((group) => (
        <Card key={group.title} size="sm">
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {group.rows.map((row) => (
                <div
                  key={row.label}
                  className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:gap-4"
                >
                  <dt className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                    {row.label}
                    {row.choose ? (
                      <Badge variant="outline" title={t("paste.chooseHint")}>
                        {t("paste.choose")}
                      </Badge>
                    ) : null}
                  </dt>
                  <dd className="text-sm break-words whitespace-pre-wrap">
                    {row.value || <span className="text-muted-foreground">{t("paste.empty")}</span>}
                  </dd>
                  <dd>
                    <CopyButton value={row.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">{t("paste.imagesNote")}</p>
    </div>
  );
}
