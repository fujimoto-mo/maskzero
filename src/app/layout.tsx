import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

// Geist for Latin text and numbers, Noto Sans JP for Japanese (stacked in globals.css).
const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const notoSansJp = Noto_Sans_JP({ variable: "--font-noto-jp", preload: false });

export const metadata: Metadata = {
  title: { default: "mask0", template: "%s | mask0" },
  description:
    "応募書類の確認から面接の日程調整まで、採用の定型作業をAIで減らす採用支援プラットフォーム。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ja"
      className={`${geist.variable} ${geistMono.variable} ${notoSansJp.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* Each route group wraps its pages in a NextIntlClientProvider with only the namespaces it uses. */}
        {children}
      </body>
    </html>
  );
}
