"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Elements that hide the bar while any of them is on screen. */
const HIDE_WHILE_VISIBLE = ["top", "contact", "site-footer"];

/**
 * Bottom CTA bar for phones on the landing page. It appears once the hero has scrolled away and
 * hides again while the contact form or the footer is on screen.
 */
export function FloatingCta() {
  const t = useTranslations("Site");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const targets = HIDE_WHILE_VISIBLE.map((id) => document.getElementById(id)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;

    const onScreen = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) onScreen.add(entry.target);
        else onScreen.delete(entry.target);
      }
      setVisible(onScreen.size === 0);
    });
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <aside
      aria-label={t("floatingCta.label")}
      inert={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur motion-safe:transition-all motion-safe:duration-300 md:hidden",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <div className="flex gap-2">
        <Button asChild className="h-11 flex-1 text-sm">
          <a href="#contact" data-contact-mode="download">
            {t("cta.download")}
          </a>
        </Button>
        <Button asChild variant="outline" className="h-11 flex-1 text-sm">
          <a href="#contact" data-contact-mode="consult">
            {t("cta.consult")}
          </a>
        </Button>
      </div>
    </aside>
  );
}
