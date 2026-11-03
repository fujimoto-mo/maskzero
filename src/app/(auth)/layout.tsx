import { NextIntlClientProvider } from "next-intl";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { clientMessages } from "@/i18n/client-messages";

// These pages read the session (to send signed-in users onward), so they render per request and
// block instead of streaming from a prerendered shell. See CLAUDE.md, "Cache Components".
export const instant = false;

export default async function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      messages={await clientMessages("Common", "Auth", "Onboarding", "Invite", "Mfa")}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-12">
        <Link href="/" aria-label="mask0">
          <Wordmark className="text-2xl" />
        </Link>
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
