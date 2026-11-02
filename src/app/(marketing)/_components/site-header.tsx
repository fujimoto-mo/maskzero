import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./mobile-nav";
import { Container } from "./primitives";
import { NAV_ITEMS } from "./site-config";

export async function SiteHeader() {
  const t = await getTranslations("Site");

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/75">
      <a
        href="#main"
        className="sr-only rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        {t("skipToContent")}
      </a>
      <Container className="flex h-14 items-center gap-3 sm:h-16">
        <Link
          href="/"
          aria-label={t("homeLabel")}
          className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Wordmark className="text-xl sm:text-2xl" />
        </Link>

        <nav aria-label={t("nav.label")} className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2 lg:ml-2">
          <Button asChild variant="ghost" className="hidden lg:inline-flex">
            <Link href="/login" prefetch={false}>
              {t("nav.login")}
            </Link>
          </Button>
          <Button asChild className="h-9 px-3">
            <Link href="/#contact" data-contact-mode="consult">
              {t("nav.consult")}
            </Link>
          </Button>
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
