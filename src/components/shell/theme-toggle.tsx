"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const readTheme = (): Theme => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
const serverTheme = (): Theme => "light";

export function ThemeToggle() {
  const t = useTranslations("Shell");
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage can be unavailable (private browsing); the theme still applies for this page.
    }
  }

  return (
    <Button variant="ghost" size="sm" data-testid="theme-toggle" onClick={toggle}>
      {theme === "dark" ? t("themeLight") : t("themeDark")}
    </Button>
  );
}
