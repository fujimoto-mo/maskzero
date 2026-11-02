import { ArrowRightIcon, DatabaseIcon, KeyRoundIcon, LockIcon, UserCheckIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "./primitives";

// Only measures that exist today; /security has the longer list.
const ITEMS = [
  { key: "isolation", icon: <DatabaseIcon /> },
  { key: "storage", icon: <LockIcon /> },
  { key: "encryption", icon: <KeyRoundIcon /> },
  { key: "human", icon: <UserCheckIcon /> },
] as const;

export async function DataProtection() {
  const t = await getTranslations("Home.protection");

  return (
    <Section
      id="protection"
      tone="muted"
      eyebrow={t("eyebrow")}
      title={t("title")}
      lead={t("lead")}
    >
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((item) => (
          <li key={item.key} className="rounded-2xl border bg-card p-5 sm:p-6">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary [&_svg]:size-5">
              {item.icon}
            </span>
            <h3 className="mt-4 font-bold">{t(`items.${item.key}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(`items.${item.key}.body`)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-8 text-center">
        <Button asChild variant="link" className="text-base">
          <Link href="/security">
            {t("link")}
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Section>
  );
}
