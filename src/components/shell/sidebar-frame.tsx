"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Phones: the brand row with a Menu button; the page list slides in over the page from the start side (the page under
 * it never moves), with a dimmed backdrop. A tap on the backdrop, the close button, Escape or a chosen page closes it.
 * From tablet width up the list is always shown beside the page.
 */
export function SidebarFrame({ brand, menu, close, children }: { brand: ReactNode; menu: string; close: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 md:mb-6">
        {brand}
        <button
          type="button"
          className="rounded-xl border border-border px-3.5 py-2 text-sm font-semibold transition-colors duration-200 hover:bg-accent md:hidden"
          aria-expanded={open}
          aria-controls="app-nav"
          data-testid="nav-toggle"
          onClick={() => setOpen(true)}
        >
          {menu}
        </button>
      </div>
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-[#07090f]/45 transition-opacity duration-300 md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        id="app-nav"
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex w-[82%] max-w-80 flex-col overflow-y-auto bg-sidebar p-4 shadow-2xl transition-transform duration-300 ease-out",
          "md:static md:z-auto md:w-auto md:max-w-none md:flex-1 md:translate-x-0 md:overflow-visible md:bg-transparent md:p-0 md:shadow-none",
          open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full md:translate-x-0! md:rtl:translate-x-0!",
        )}
        onClickCapture={(event) => {
          if ((event.target as HTMLElement).closest("a")) setOpen(false);
        }}
      >
        <div className="mb-4 flex items-center justify-between md:hidden">
          {brand}
          <button type="button" aria-label={close} onClick={() => setOpen(false)} className="flex size-10 items-center justify-center rounded-xl border border-border">
            <X aria-hidden="true" className="size-[18px]" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
