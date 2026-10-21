"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

/** While drafts are being written, re-fetch the page at the engine's poll interval (spec v1.1 §2, no webhook yet). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
