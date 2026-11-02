import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "./primitives";

/** Tag handlers for legal texts written with <p>, <ul>, <ol>, <li> and <b> in the messages. */
export const richText = {
  p: (chunks: ReactNode) => <p>{chunks}</p>,
  ul: (chunks: ReactNode) => <ul>{chunks}</ul>,
  ol: (chunks: ReactNode) => <ol>{chunks}</ol>,
  li: (chunks: ReactNode) => <li>{chunks}</li>,
  b: (chunks: ReactNode) => <strong>{chunks}</strong>,
};

/** Typography for rich legal text (paragraphs, lists, bold). */
export const proseClassName =
  "space-y-3 text-[15px] leading-7 [&_li]:mt-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 marker:text-muted-foreground";

export type TocItem = { id: string; title: string };

/** Breadcrumb, optional draft banner, h1 and intro for the privacy, terms, security and company pages. */
export async function PageShell({
  title,
  intro,
  draft = false,
  toc,
  children,
}: {
  title: string;
  intro?: ReactNode;
  draft?: boolean;
  toc?: TocItem[];
  children: ReactNode;
}) {
  const t = await getTranslations("Site");

  return (
    <div className="bg-muted/30">
      <Container className="max-w-3xl py-10 sm:py-14">
        <nav aria-label={t("legal.breadcrumbLabel")} className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-foreground hover:underline">
                {t("legal.home")}
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRightIcon className="size-3.5" />
            </li>
            <li aria-current="page" className="text-foreground">
              {title}
            </li>
          </ol>
        </nav>

        {draft ? (
          <div
            role="note"
            className="mt-6 flex items-start gap-3 rounded-xl border border-chart-4 bg-chart-4/15 p-4 text-sm font-semibold"
          >
            <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <p>{t("draftBanner")}</p>
          </div>
        ) : null}

        <h1 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {intro ? (
          <div className="mt-4 text-[15px] leading-7 text-muted-foreground">{intro}</div>
        ) : null}

        {toc?.length ? (
          <nav aria-labelledby="toc-title" className="mt-8 rounded-2xl border bg-card p-5 sm:p-6">
            <h2 id="toc-title" className="text-sm font-semibold">
              {t("legal.tocTitle")}
            </h2>
            <ol className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {toc.map((item) => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-primary hover:underline">
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}

        <div className="mt-8">{children}</div>

        <p className="mt-10">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            {t("legal.backToHome")}
          </Link>
        </p>
      </Container>
    </div>
  );
}

/** A numbered section of a legal document. */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <h2 id={`${id}-title`} className="text-lg font-bold sm:text-xl">
        {title}
      </h2>
      <div className={`mt-3 ${proseClassName}`}>{children}</div>
    </section>
  );
}
