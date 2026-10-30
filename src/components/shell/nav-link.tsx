"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function NavLink({ href, match, testId, children }: { href: string; match?: string; testId: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(match ?? href);
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm text-foreground/85 transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent font-semibold text-sidebar-accent-foreground",
      )}
    >
      {children}
    </Link>
  );
}
