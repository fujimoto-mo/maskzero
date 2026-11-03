"use client";

import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type ClientResult, createClientAction, renameClientAction } from "../actions";
import type { ClientRow } from "../queries";

type Target = { orgSlug: string; clientSlug: string };

/** The agency's client companies: add one, rename, open its workspace (docs/02 M1-1, M1-5). */
export function ClientsView({ target, rows }: { target: Target; rows: ClientRow[] }) {
  const t = useTranslations("Clients");
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState<string | null>(null);

  const report = (result: ClientResult, done: string) => {
    if (result.ok) toast.success(done);
    else toast.error(t(`errors.${result.error}`));
    return result.ok;
  };

  function create(form: FormData) {
    startTransition(async () => {
      const result = await createClientAction(target.orgSlug, target.clientSlug, {
        name: String(form.get("name") ?? ""),
        slug: String(form.get("slug") ?? ""),
      });
      report(result, t("created"));
    });
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("addTitle")}</CardTitle>
          <CardDescription>{t("addDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={create} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="client-name">{t("name")}</Label>
              <Input id="client-name" name="name" required maxLength={100} className="w-64" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-slug">{t("slug")}</Label>
              <Input
                id="client-slug"
                name="slug"
                required
                maxLength={32}
                pattern="[a-z0-9](?:[a-z0-9\-]{0,30}[a-z0-9])?"
                aria-describedby="client-slug-hint"
                className="w-48"
              />
            </div>
            <Button type="submit" disabled={pending}>
              <PlusIcon aria-hidden />
              {t("add")}
            </Button>
            <p id="client-slug-hint" className="basis-full text-xs text-muted-foreground">
              {t("slugHint")}
            </p>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                <TableHead>{t("slug")}</TableHead>
                <TableHead className="text-right">{t("publishedJobs")}</TableHead>
                <TableHead className="text-right">{t("activeApplications")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    {renaming === row.id ? (
                      <form
                        className="flex items-center gap-2"
                        action={(form) =>
                          startTransition(async () => {
                            const ok = report(
                              await renameClientAction(
                                target.orgSlug,
                                target.clientSlug,
                                row.id,
                                String(form.get("name") ?? ""),
                              ),
                              t("renamed"),
                            );
                            if (ok) setRenaming(null);
                          })
                        }
                      >
                        <Input
                          name="name"
                          defaultValue={row.name}
                          required
                          maxLength={100}
                          aria-label={t("name")}
                          className="w-56"
                          autoFocus
                        />
                        <Button type="submit" size="sm" disabled={pending}>
                          {t("save")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setRenaming(null)}
                        >
                          {t("cancel")}
                        </Button>
                      </form>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {row.name}
                        {row.isDefault ? <Badge variant="outline">{t("default")}</Badge> : null}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{row.slug}</code>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.publishedJobs}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.activeApplications}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {renaming === row.id ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRenaming(row.id)}
                        aria-label={t("renameOf", { name: row.name })}
                      >
                        {t("rename")}
                      </Button>
                    )}
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/app/${target.orgSlug}/${row.slug}/dashboard`}>{t("open")}</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
