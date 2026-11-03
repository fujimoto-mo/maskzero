"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { enableInboundAddressAction } from "../actions";
import type { InboundLogRow } from "../queries";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/** The company's inbound address and what arrived there (docs/02 M3-10). */
export function InboundSettings({
  target,
  address,
  configured,
  log,
}: {
  target: { orgSlug: string; clientSlug: string };
  address: string | null;
  configured: boolean;
  log: InboundLogRow[];
}) {
  const t = useTranslations("Settings.inbound");
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!configured ? (
            <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>
          ) : address ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-2 py-1 text-sm break-all">{address}</code>
                <CopyButton value={address} />
              </div>
              <ol className="grid list-decimal gap-1 pl-5 text-sm">
                <li>{t("step1")}</li>
                <li>{t("step2")}</li>
                <li>{t("step3")}</li>
              </ol>
            </>
          ) : (
            <Button
              className="justify-self-start"
              disabled={pending}
              onClick={() =>
                startTransition(() => enableInboundAddressAction(target.orgSlug, target.clientSlug))
              }
            >
              {t("enable")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("logTitle")}</CardTitle>
          <CardDescription>{t("logHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("logEmpty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("receivedAt")}</TableHead>
                  <TableHead>{t("kind")}</TableHead>
                  <TableHead>{t("subject")}</TableHead>
                  <TableHead>{t("result")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {timeFormat.format(new Date(row.receivedAt))}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t(`kinds.${row.kind}`)}
                      {row.channel ? `（${row.channel}）` : ""}
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-sm">{row.subject}</TableCell>
                    <TableCell className="text-sm">
                      {row.failure ? (
                        <span className="text-destructive">
                          {t(`failures.${row.failure as "board"}`)}
                        </span>
                      ) : (
                        (row.clientName ?? "—")
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
