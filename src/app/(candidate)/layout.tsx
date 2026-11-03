import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand/wordmark";
import { Toaster } from "@/components/ui/sonner";
import { clientMessages } from "@/i18n/client-messages";

// Candidate pages: the entry form (/a/{code}) and the personal page (/p/{token}). Phone-first, and
// never indexed: the links are shared one-to-one, and personal pages carry a secret token.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CandidateLayout({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      messages={await clientMessages("Common", "Entry", "Portal", "Booking", "Consent")}
    >
      <div className="flex min-h-svh flex-col bg-muted/40">
        <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        <footer className="flex items-center justify-center gap-1.5 pb-8 text-xs text-muted-foreground">
          <Wordmark className="text-sm" />
        </footer>
        <Toaster position="top-center" richColors />
      </div>
    </NextIntlClientProvider>
  );
}
