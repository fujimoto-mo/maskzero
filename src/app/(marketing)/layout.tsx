import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";
import { clientMessages } from "@/i18n/client-messages";
import { BRAND_NAME, SITE_URL } from "./_components/site-config";

// The public site is the same for every visitor: fail the build if anything in it starts
// rendering per request (cookies, headers, searchParams, uncached fetches). See CLAUDE.md.
export const ensureStatic = "navigation";

// Pages set their own title, description and canonical. The OG image comes from
// ./opengraph-image.tsx; og:title and og:description fall back to each page's title and description.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  openGraph: { type: "website", siteName: BRAND_NAME, locale: "ja_JP" },
  twitter: { card: "summary_large_image" },
};

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider messages={await clientMessages("Common", "Site", "Home", "Demo")}>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </NextIntlClientProvider>
  );
}
