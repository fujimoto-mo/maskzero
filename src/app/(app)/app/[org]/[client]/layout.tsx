import {
  BriefcaseBusinessIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  FileCheckIcon,
  LayoutDashboardIcon,
  LinkIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CommandSearch } from "@/components/app-shell/command-search";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { NavLink } from "@/components/app-shell/nav-link";
import { NotificationsMenu } from "@/components/app-shell/notifications-menu";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { Wordmark } from "@/components/brand/wordmark";
import { Toaster } from "@/components/ui/sonner";
import { getNotifications } from "@/features/notifications/queries";
import { requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

// Later-phase screens join the nav when they ship, not before (docs/03 §5).
export default async function ClientLayout({
  children,
  params,
}: LayoutProps<"/app/[org]/[client]">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const [t, notifications] = await Promise.all([
    getTranslations(),
    getNotifications(ctx, new Date()),
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
        <NavLink href={`${base}/candidates`} icon={<UsersIcon aria-hidden />}>
          {t("App.nav.candidates")}
        </NavLink>
        <NavLink href={`${base}/scheduling`} icon={<CalendarDaysIcon aria-hidden />}>
          {t("App.nav.scheduling")}
        </NavLink>
        <NavLink href={`${base}/entry-urls`} icon={<LinkIcon aria-hidden />}>
          {t("App.nav.entryUrls")}
        </NavLink>
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
          <div className="ml-auto flex items-center gap-2">
            <CommandSearch base={base} />
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
