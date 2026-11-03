import {
  BotMessageSquareIcon,
  Building2Icon,
  BriefcaseBusinessIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ChartColumnIcon,
  FileCheckIcon,
  LayoutDashboardIcon,
  LinkIcon,
  MailIcon,
  MessagesSquareIcon,
  SettingsIcon,
  UserSearchIcon,
  UsersIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ClientSwitcher } from "@/components/app-shell/client-switcher";
import { CommandSearch } from "@/components/app-shell/command-search";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { NavLink } from "@/components/app-shell/nav-link";
import { NotificationsMenu } from "@/components/app-shell/notifications-menu";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { Wordmark } from "@/components/brand/wordmark";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { AI_FEATURE } from "@/features/ai-interview/domain";
import { listClientOptions } from "@/features/clients/queries";
import { countUnreadReplies } from "@/features/inbound/queries";
import { getNotifications } from "@/features/notifications/queries";
import { canEdit, isAdmin, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

// Later-phase screens join the nav when they ship, not before (docs/03 §5).
export default async function ClientLayout({
  children,
  params,
}: LayoutProps<"/app/[org]/[client]">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const agency = ctx.orgKind === "agency";
  const interviewer = ctx.role === "interviewer";
  const [t, notifications, clientOptions, unreadReplies] = await Promise.all([
    getTranslations(),
    getNotifications(ctx, new Date()),
    agency ? listClientOptions(ctx) : Promise.resolve([]),
    countUnreadReplies(ctx),
  ]);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

  const sidebar = (
    <>
      <Link href={`${base}/dashboard`} aria-label="mask0">
        <Wordmark className="text-xl" />
      </Link>
      <div className="text-sm">
        <p className="font-medium">{ctx.orgName}</p>
        {ctx.orgKind === "agency" ? (
          <p className="text-muted-foreground">{ctx.clientName}</p>
        ) : null}
      </div>
      <nav aria-label={t("App.nav.mainMenu")} className="flex flex-col gap-1">
        {/* Interviewers work only on the interviews they run (docs/02 M1-4). */}
        {interviewer ? null : (
          <>
            <NavLink href={`${base}/dashboard`} icon={<LayoutDashboardIcon aria-hidden />}>
              {t("App.nav.dashboard")}
            </NavLink>
            <NavLink href={`${base}/jobs`} icon={<BriefcaseBusinessIcon aria-hidden />}>
              {t("App.nav.jobs")}
            </NavLink>
            <NavLink href={`${base}/screening`} icon={<FileCheckIcon aria-hidden />}>
              {t("App.nav.screening")}
            </NavLink>
            <NavLink href={`${base}/interviews`} icon={<CalendarCheckIcon aria-hidden />}>
              {t("App.nav.interviews")}
            </NavLink>
            {ctx.featureFlags.includes(AI_FEATURE) ? (
              <NavLink href={`${base}/ai-interviews`} icon={<BotMessageSquareIcon aria-hidden />}>
                {t("App.nav.aiInterviews")}
              </NavLink>
            ) : null}
          </>
        )}
        <NavLink href={`${base}/meetings`} icon={<MessagesSquareIcon aria-hidden />}>
          {t("App.nav.day")}
        </NavLink>
        {interviewer ? null : (
          <>
            <NavLink href={`${base}/candidates`} icon={<UsersIcon aria-hidden />}>
              {t("App.nav.candidates")}
            </NavLink>
            {agency && canEdit(ctx) ? (
              <NavLink href={`${base}/pool`} icon={<UserSearchIcon aria-hidden />}>
                {t("App.nav.pool")}
              </NavLink>
            ) : null}
            <NavLink href={`${base}/scheduling`} icon={<CalendarDaysIcon aria-hidden />}>
              {t("App.nav.scheduling")}
            </NavLink>
            <NavLink href={`${base}/entry-urls`} icon={<LinkIcon aria-hidden />}>
              {t("App.nav.entryUrls")}
            </NavLink>
            <NavLink href={`${base}/analytics`} icon={<ChartColumnIcon aria-hidden />}>
              {t("App.nav.analytics")}
            </NavLink>
          </>
        )}
        {agency && isAdmin(ctx) ? (
          <NavLink href={`${base}/clients`} icon={<Building2Icon aria-hidden />}>
            {t("App.nav.clients")}
          </NavLink>
        ) : null}
        <NavLink href={`${base}/settings`} icon={<SettingsIcon aria-hidden />}>
          {t("App.nav.settings")}
        </NavLink>
      </nav>
    </>
  );

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        {sidebar}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b px-4 md:px-6">
          <MobileNav label={t("App.nav.openMenu")} title={t("App.nav.mainMenu")}>
            {sidebar}
          </MobileNav>
          <Link href={`${base}/dashboard`} aria-label="mask0" className="md:hidden">
            <Wordmark className="text-lg" />
          </Link>
          {clientOptions.length > 1 ? (
            <ClientSwitcher
              orgSlug={ctx.orgSlug}
              current={ctx.clientSlug}
              clients={clientOptions.map((c) => ({ slug: c.slug, name: c.name }))}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <CommandSearch base={base} />
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={
                unreadReplies > 0
                  ? t("App.messages.labelUnread", { count: unreadReplies })
                  : t("App.messages.label")
              }
            >
              <Link href={`${base}/messages`}>
                <MailIcon aria-hidden />
                {unreadReplies > 0 ? (
                  <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white tabular-nums">
                    {unreadReplies > 9 ? "9+" : unreadReplies}
                  </span>
                ) : null}
              </Link>
            </Button>
            <NotificationsMenu
              base={base}
              items={notifications.items}
              unread={notifications.unread}
            />
            <span className="hidden text-sm text-muted-foreground sm:inline">{ctx.email}</span>
            <SignOutButton label={t("Common.logOut")} />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}
