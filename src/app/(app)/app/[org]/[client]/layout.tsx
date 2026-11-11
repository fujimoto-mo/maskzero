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
import type { ReactNode } from "react";
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
import { DemoBanner } from "@/features/demo/components/demo-banner";
import { canEdit, isAdmin, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

type NavItem = { href: string; icon: ReactNode; label: string };

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
  const item = (path: string, icon: ReactNode, label: string): NavItem => ({
    href: `${base}/${path}`,
    icon,
    label,
  });

  // Grouped in hiring order. Interviewers work only on the interviews they run (docs/02 M1-4).
  const groups: NavItem[][] = [
    interviewer
      ? []
      : [item("dashboard", <LayoutDashboardIcon aria-hidden />, t("App.nav.dashboard"))],
    [
      ...(interviewer
        ? []
        : [
            item("jobs", <BriefcaseBusinessIcon aria-hidden />, t("App.nav.jobs")),
            item("entry-urls", <LinkIcon aria-hidden />, t("App.nav.entryUrls")),
            item("screening", <FileCheckIcon aria-hidden />, t("App.nav.screening")),
            item("interviews", <CalendarCheckIcon aria-hidden />, t("App.nav.interviews")),
            item("scheduling", <CalendarDaysIcon aria-hidden />, t("App.nav.scheduling")),
          ]),
      item("meetings", <MessagesSquareIcon aria-hidden />, t("App.nav.day")),
      ...(!interviewer && ctx.featureFlags.includes(AI_FEATURE)
        ? [item("ai-interviews", <BotMessageSquareIcon aria-hidden />, t("App.nav.aiInterviews"))]
        : []),
    ],
    [
      ...(interviewer
        ? []
        : [item("candidates", <UsersIcon aria-hidden />, t("App.nav.candidates"))]),
      ...(!interviewer && agency && canEdit(ctx)
        ? [item("pool", <UserSearchIcon aria-hidden />, t("App.nav.pool"))]
        : []),
      ...(interviewer
        ? []
        : [item("analytics", <ChartColumnIcon aria-hidden />, t("App.nav.analytics"))]),
      ...(agency && isAdmin(ctx)
        ? [item("clients", <Building2Icon aria-hidden />, t("App.nav.clients"))]
        : []),
    ],
  ].filter((group) => group.length > 0);
  const settings = item("settings", <SettingsIcon aria-hidden />, t("App.nav.settings"));
  const userLabel = ctx.demo ? t("App.demo.user") : ctx.email;
  const workspace = agency ? ctx.clientName : ctx.orgName;

  const links = (variant: "rail" | "list", list: NavItem[]) =>
    list.map((link) => (
      <NavLink key={link.href} href={link.href} icon={link.icon} variant={variant}>
        {link.label}
      </NavLink>
    ));

  return (
    <div className="flex min-h-svh bg-canvas">
      <aside className="sticky top-0 hidden h-svh w-26 shrink-0 py-3 pl-3 md:block">
        <div className="flex h-full [scrollbar-width:none] flex-col items-center gap-2 overflow-y-auto rounded-2xl bg-card px-1 py-3.5 shadow-[0_1px_2px_oklch(0.21_0.02_255/0.05)] ring-1 ring-foreground/[0.07]">
          <Link href={`${base}/dashboard`} aria-label="mask0" className="px-1">
            <Wordmark className="text-base" />
          </Link>
          <nav aria-label={t("App.nav.mainMenu")} className="flex w-full flex-col items-center">
            {groups.map((group, index) => (
              <div key={group[0]!.href} className="flex w-full flex-col items-center">
                {index > 0 ? <span aria-hidden className="my-1.5 h-px w-8 bg-border" /> : null}
                {links("rail", group)}
              </div>
            ))}
          </nav>
          <div className="mt-auto flex w-full flex-col items-center pt-1">
            {links("rail", [settings])}
            <SignOutButton label={t("Common.logOut")} variant="rail" />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-2 px-4 md:px-6">
          <MobileNav label={t("App.nav.openMenu")} title={t("App.nav.mainMenu")}>
            <Link href={`${base}/dashboard`} aria-label="mask0">
              <Wordmark className="text-xl" />
            </Link>
            <div className="text-sm">
              <p className="font-medium">{ctx.orgName}</p>
              {agency ? <p className="text-muted-foreground">{ctx.clientName}</p> : null}
            </div>
            <nav aria-label={t("App.nav.mainMenu")} className="flex flex-col gap-1">
              {groups.map((group, index) => (
                <div key={group[0]!.href} className="flex flex-col gap-1">
                  {index > 0 ? <span aria-hidden className="mx-3 my-1 h-px bg-border" /> : null}
                  {links("list", group)}
                </div>
              ))}
              <span aria-hidden className="mx-3 my-1 h-px bg-border" />
              {links("list", [settings])}
            </nav>
            <SignOutButton label={t("Common.logOut")} />
          </MobileNav>
          <Link href={`${base}/dashboard`} aria-label="mask0" className="md:hidden">
            <Wordmark className="text-lg" />
          </Link>
          <CommandSearch base={base} />
          <div className="ml-auto flex items-center gap-2">
            {clientOptions.length > 1 ? (
              <ClientSwitcher
                orgSlug={ctx.orgSlug}
                current={ctx.clientSlug}
                clients={clientOptions.map((c) => ({ slug: c.slug, name: c.name }))}
              />
            ) : (
              <span className="hidden h-9 max-w-56 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium ring-1 ring-foreground/[0.07] lg:inline-flex">
                <Building2Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{workspace}</span>
              </span>
            )}
            <Button
              asChild
              variant="outline"
              size="icon"
              className="relative size-9 rounded-full border-transparent bg-card ring-1 ring-foreground/[0.07]"
              aria-label={
                unreadReplies > 0
                  ? t("App.messages.labelUnread", { count: unreadReplies })
                  : t("App.messages.label")
              }
            >
              <Link href={`${base}/messages`}>
                <MailIcon aria-hidden />
                {unreadReplies > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-white tabular-nums">
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
            <div className="hidden h-9 items-center gap-2 rounded-full bg-card py-1 pr-3.5 pl-1 ring-1 ring-foreground/[0.07] sm:flex">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground uppercase"
              >
                {userLabel.slice(0, 1)}
              </span>
              <span className="grid leading-tight">
                <span className="max-w-44 truncate text-xs font-medium">{userLabel}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t(`App.roles.${ctx.role}`)}
                </span>
              </span>
            </div>
          </div>
        </header>
        {ctx.demo ? <DemoBanner userId={ctx.userId} /> : null}
        <main className="flex-1 px-4 pt-2 pb-10 md:px-6">{children}</main>
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}
