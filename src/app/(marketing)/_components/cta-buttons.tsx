import { ArrowRightIcon, DownloadIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The landing page's two calls to action. Both jump to the contact form; `data-contact-mode`
 * tells the form which mode to switch to (see contact-form.tsx). Use on the landing page only.
 */
export async function CtaButtons({
  tone = "default",
  className,
}: {
  tone?: "default" | "inverted";
  className?: string;
}) {
  const t = await getTranslations("Site.cta");
  const inverted = tone === "inverted";

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row", className)}>
      <Button
        asChild
        size="lg"
        className={cn(
          "h-12 px-6 text-base",
          inverted && "bg-background text-foreground hover:bg-background/90",
        )}
      >
        <a href="#contact" data-contact-mode="download">
          <DownloadIcon aria-hidden="true" />
          {t("download")}
        </a>
      </Button>
      <Button
        asChild
        size="lg"
        variant="outline"
        className={cn(
          "h-12 px-6 text-base",
          inverted &&
            "border-primary-foreground/50 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground dark:border-primary-foreground/50 dark:bg-transparent",
        )}
      >
        <a href="#contact" data-contact-mode="consult">
          {t("consult")}
          <ArrowRightIcon aria-hidden="true" />
        </a>
      </Button>
    </div>
  );
}
