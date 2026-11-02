"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Sidebar link that highlights itself on the current route. Pass the icon as an element
 * (`icon={<SomeIcon />}`): Server Components can't pass component functions to Client Components.
 */
export function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent [&_svg]:size-4",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
