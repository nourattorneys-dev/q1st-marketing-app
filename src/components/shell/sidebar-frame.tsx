"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Phones: the brand row with a Menu button; the pages list opens and closes smoothly under it, and closes after a page
 * is chosen. From tablet width up the list is always shown beside the page.
 */
export function SidebarFrame({ brand, menu, close, children }: { brand: ReactNode; menu: string; close: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between gap-3 md:mb-6">
        {brand}
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent md:hidden"
          aria-expanded={open}
          aria-controls="app-nav"
          data-testid="nav-toggle"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? close : menu}
        </button>
      </div>
      <div
        id="app-nav"
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out md:min-h-0 md:flex-1 md:grid-rows-[1fr] md:opacity-100",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        {/* A link chosen in the list closes it (the page changes under it). */}
        <div
          className={cn("min-h-0 overflow-hidden md:overflow-visible", open && "pt-4 md:pt-0")}
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
