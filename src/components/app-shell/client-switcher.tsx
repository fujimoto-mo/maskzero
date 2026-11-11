"use client";

import { Building2Icon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Header switcher between the agency's clients; the client lives in the URL (docs/02 M1-5). */
export function ClientSwitcher({
  orgSlug,
  current,
  clients,
}: {
  orgSlug: string;
  current: string;
  clients: { slug: string; name: string }[];
}) {
  const t = useTranslations("App.switcher");
  const active = clients.find((c) => c.slug === current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 max-w-32 rounded-full border-transparent bg-card px-3.5 ring-1 ring-foreground/[0.07] sm:max-w-56"
          aria-label={t("label")}
        >
          <Building2Icon aria-hidden />
          <span className="truncate">{active?.name ?? current}</span>
          <ChevronsUpDownIcon aria-hidden className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {clients.map((c) => (
          <DropdownMenuItem key={c.slug} asChild>
            <Link
              href={`/app/${orgSlug}/${c.slug}/dashboard`}
              aria-current={c.slug === current ? "page" : undefined}
            >
              <span className="truncate">{c.name}</span>
              {c.slug === current ? <CheckIcon aria-hidden className="ml-auto" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
