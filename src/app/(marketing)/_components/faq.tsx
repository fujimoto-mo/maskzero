import { getTranslations } from "next-intl/server";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Section } from "./primitives";

/** Shared with the FAQPage JSON-LD so the structured data matches the visible answers. */
export const FAQ_KEYS = [
  "autoReject",
  "criteria",
  "interviewers",
  "aiInterviewer",
  "jobBoards",
  "data",
  "pricing",
] as const;

export async function Faq() {
  const t = await getTranslations("Home.faq");

  return (
    <Section id="faq" eyebrow={t("eyebrow")} title={t("title")}>
      <Accordion
        type="single"
        collapsible
        className="mx-auto mt-10 max-w-3xl rounded-2xl border bg-card px-4 motion-reduce:**:data-[slot=accordion-content]:animate-none! sm:px-6"
      >
        {FAQ_KEYS.map((key) => (
          <AccordionItem key={key} value={key}>
            <AccordionTrigger className="py-4 text-base leading-relaxed font-semibold hover:no-underline">
              {t(`items.${key}.q`)}
            </AccordionTrigger>
            <AccordionContent className="pb-5 text-[15px] leading-7 text-muted-foreground">
              {t(`items.${key}.a`)}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
