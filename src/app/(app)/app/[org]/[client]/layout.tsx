import { LayoutDashboardIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { NavLink } from "@/components/app-shell/nav-link";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { Wordmark } from "@/components/brand/wordmark";
import { requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

// Later-phase screens join the nav when they ship, not before (docs/03 §5).
export default async function ClientLayout({
  children,
  params,
}: LayoutProps<"/app/[org]/[client]">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const t = await getTranslations();
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
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
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b px-4 md:px-6">
          <Link href={`${base}/dashboard`} aria-label="mask0" className="md:hidden">
            <Wordmark className="text-lg" />
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{ctx.email}</span>
            <SignOutButton label={t("Common.logOut")} />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
