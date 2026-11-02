import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Container } from "./primitives";

const SERVICE_LINKS = [
  { key: "features", href: "/#features" },
  { key: "flow", href: "/#flow" },
  { key: "faq", href: "/#faq" },
  { key: "contact", href: "/#contact" },
  { key: "login", href: "/login" },
] as const;

const ABOUT_LINKS = [
  { key: "security", href: "/security" },
  { key: "company", href: "/company" },
  { key: "privacy", href: "/privacy" },
  { key: "terms", href: "/terms" },
] as const;

const linkClass =
  "rounded-sm text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

export async function SiteFooter() {
  const t = await getTranslations("Site");
  const operator = t("operator.name");

  return (
    <footer id="site-footer" className="border-t bg-muted/40">
      <Container className="grid gap-10 py-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <Link
            href="/"
            aria-label={t("homeLabel")}
            className="inline-block rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Wordmark className="text-2xl" />
          </Link>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">{t("footer.tagline")}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            {t("footer.operator", { name: operator })}
          </p>
        </div>
        <nav aria-label={t("footer.navLabel")} className="grid grid-cols-2 gap-8 text-sm">
          <div>
            <h2 className="font-semibold">{t("footer.serviceHeading")}</h2>
            <ul className="mt-3 space-y-2.5">
              {SERVICE_LINKS.map((link) => (
                <li key={link.key}>
                  <Link
                    href={link.href}
                    prefetch={link.key === "login" ? false : undefined}
                    className={linkClass}
                  >
                    {t(`footer.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">{t("footer.aboutHeading")}</h2>
            <ul className="mt-3 space-y-2.5">
              {ABOUT_LINKS.map((link) => (
                <li key={link.key}>
                  <Link href={link.href} className={linkClass}>
                    {t(`footer.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </Container>
      <div className="border-t">
        <Container className="py-5 text-xs text-muted-foreground">
          <p>{t("footer.copyright", { name: operator })}</p>
        </Container>
      </div>
    </footer>
  );
}
