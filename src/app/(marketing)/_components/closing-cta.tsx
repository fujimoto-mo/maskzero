import { getTranslations } from "next-intl/server";
import { CtaButtons } from "./cta-buttons";
import { Container } from "./primitives";

export async function ClosingCta() {
  const t = await getTranslations("Home.closing");

  return (
    <section aria-labelledby="closing-title" className="py-16 sm:py-20">
      <Container>
        <div className="relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12 sm:py-16">
          <div
            aria-hidden="true"
            className="absolute -top-24 -right-24 -z-10 size-72 rounded-full bg-primary-foreground/10 blur-2xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-32 -left-20 -z-10 size-72 rounded-full bg-primary-foreground/5 blur-2xl"
          />
          <h2
            id="closing-title"
            className="mx-auto max-w-2xl text-2xl leading-snug font-bold text-balance [word-break:auto-phrase] sm:text-3xl"
          >
            {t("title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl leading-relaxed text-pretty text-primary-foreground/85">
            {t("lead")}
          </p>
          <CtaButtons tone="inverted" className="mt-8 sm:justify-center" />
        </div>
      </Container>
    </section>
  );
}
