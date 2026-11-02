import {
  BellIcon,
  ChartColumnIcon,
  ClipboardListIcon,
  FileSpreadsheetIcon,
  LayersIcon,
  Link2Icon,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Section, StatusBadge } from "./primitives";

const MORE = [
  { key: "entryLink", icon: <Link2Icon /> },
  { key: "posting", icon: <ClipboardListIcon /> },
  { key: "import", icon: <FileSpreadsheetIcon /> },
  { key: "analytics", icon: <ChartColumnIcon /> },
  { key: "nurture", icon: <BellIcon /> },
  { key: "clients", icon: <LayersIcon /> },
] as const;

export async function MoreFeatures() {
  const t = await getTranslations("Home.more");

  return (
    <Section id="more" tone="muted" eyebrow={t("eyebrow")} title={t("title")}>
      <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MORE.map((item) => (
          <li key={item.key} className="rounded-2xl border bg-card p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-primary [&_svg]:size-5">
                {item.icon}
              </span>
              <StatusBadge label={t(`items.${item.key}.status`)} />
            </div>
            <h3 className="mt-4 font-bold">{t(`items.${item.key}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(`items.${item.key}.body`)}
            </p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
