import { CheckIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ContactForm } from "./contact-form";
import { Container, SectionHeading } from "./primitives";

const POINTS = ["guide", "demo", "start"] as const;

export async function ContactSection() {
  const t = await getTranslations("Home.contact");

  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className="scroll-mt-16 bg-accent/40 py-16 sm:py-20"
    >
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
        <div>
          <SectionHeading
            id="contact-title"
            align="start"
            eyebrow={t("eyebrow")}
            title={t("title")}
            lead={t("lead")}
          />
          <ul className="mt-8 space-y-3">
            {POINTS.map((key) => (
              <li key={key} className="flex gap-3 leading-relaxed">
                <CheckIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
                {t(`points.${key}`)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
          <ContactForm />
        </div>
      </Container>
    </section>
  );
}
