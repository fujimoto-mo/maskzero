"use client";

import { BellIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markNotificationsReadAction } from "@/features/notifications/actions";
import type { NotificationItem } from "@/features/notifications/queries";
import { cn } from "@/lib/utils";

const timeFormat = new Intl.DateTimeFormat("ja-JP", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tokyo",
});

/** The header bell: recent entries and applications that need a person (docs/02 M6-4). */
export function NotificationsMenu({
  base,
  items,
  unread,
}: {
  base: string;
  items: NotificationItem[];
  unread: number;
}) {
  const t = useTranslations("App.notifications");
  const [, startTransition] = useTransition();
  const [orgSlug, clientSlug] = base.split("/").slice(2, 4) as [string, string];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? t("labelUnread", { count: unread }) : t("label")}
        >
          <BellIcon aria-hidden />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel>{t("title")}</DropdownMenuLabel>
          {unread > 0 ? (
            <Button
              variant="link"
              size="xs"
              onClick={() =>
                startTransition(() => markNotificationsReadAction(orgSlug, clientSlug))
              }
            >
              {t("markAllRead")}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={`${item.kind}-${item.applicationId}-${item.at}`} asChild>
              <Link
                href={`${base}/screening?job=${item.jobId}&app=${item.applicationId}`}
                className="grid gap-0.5"
              >
                <span className={cn("text-sm", item.unread && "font-medium")}>
                  {item.unread ? (
                    <span className="mr-1.5 inline-block size-1.5 rounded-full bg-primary align-middle" />
                  ) : null}
                  {t(item.kind === "application" ? "newApplication" : "needsReview", {
                    name: item.name,
                  })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {timeFormat.format(new Date(item.at))}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
