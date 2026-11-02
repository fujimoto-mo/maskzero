import { FileTextIcon, HourglassIcon, MailIcon, RepeatIcon, UsersIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Section } from "./primitives";

const PAINS = [
  { key: "reading", icon: <FileTextIcon /> },
  { key: "notices", icon: <MailIcon /> },
  { key: "scheduling", icon: <RepeatIcon /> },
  { key: "followup", icon: <HourglassIcon /> },
  { key: "headcount", icon: <UsersIcon /> },
] as const;

export async function PainPoints() {
  const t = await getTranslations("Home.pains");

  return (
    <Section id="pains" eyebrow={t("eyebrow")} title={t("title")}>
      {/* Six columns on large screens so the last row of two cards sits centred. */}
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        {PAINS.map((pain, index) => (
          <li
            key={pain.key}
            className={cn(
              "flex flex-col rounded-2xl border bg-card p-5 sm:p-6 lg:col-span-2",
              index === 3 && "lg:col-start-2",
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground/70 [&_svg]:size-5">
              {pain.icon}
            </span>
            <h3 className="mt-4 leading-snug font-bold">{t(`items.${pain.key}.title`)}</h3>
            <div className="mt-auto pt-4">
              <p className="border-t pt-3 text-xs font-semibold text-destructive">
                {t("resultLabel")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{t(`items.${pain.key}.result`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
