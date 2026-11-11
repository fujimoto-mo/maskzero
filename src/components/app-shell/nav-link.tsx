"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RAIL_ICON, RAIL_ITEM } from "./rail";

/**
 * Navigation link that highlights itself on the current route: an icon tile with a short label in
 * the desktop rail, a row in the phone menu. Pass the icon as an element (`icon={<SomeIcon />}`):
 * Server Components can't pass component functions to Client Components.
 */
export function NavLink({
  href,
  icon,
  children,
  variant = "list",
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  variant?: "rail" | "list";
}) {
  const active = usePathname().startsWith(href);
  if (variant === "rail") {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(RAIL_ITEM, active && "font-semibold text-foreground")}
      >
        <span
          className={cn(
            RAIL_ICON,
            active ? "bg-primary text-primary-foreground" : "group-hover/nav:bg-muted",
          )}
        >
          {icon}
        </span>
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-muted [&_svg]:size-4",
        active && "bg-accent font-medium text-accent-foreground hover:bg-accent",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
