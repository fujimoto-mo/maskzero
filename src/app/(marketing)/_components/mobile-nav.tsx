"use client";

import { MenuIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS } from "./site-config";

/**
 * Disclosure menu for phones and tablets. A plain panel instead of a modal sheet, so in-page
 * anchor links scroll normally (a modal's scroll lock would swallow the jump).
 */
export function MobileNav() {
  const t = useTranslations("Site.nav");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const close = () => setOpen(false);
  const linkClass =
    "flex min-h-12 items-center rounded-md px-2 text-base outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div ref={rootRef} className="lg:hidden">
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <XIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
        <span className="sr-only">{open ? t("closeMenu") : t("openMenu")}</span>
      </Button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b bg-background shadow-lg"
      >
        <nav aria-label={t("label")}>
          <ul className="mx-auto flex max-w-6xl flex-col divide-y divide-border/60 px-4 py-2 sm:px-6">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link href={item.href} onClick={close} className={linkClass}>
                  {t(item.key)}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/login" prefetch={false} onClick={close} className={linkClass}>
                {t("login")}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
