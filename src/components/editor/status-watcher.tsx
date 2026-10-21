"use client";

import { useEffect } from "react";
import { loadPostAction } from "@/app/[locale]/(app)/review/actions";

type Props = { locale: string; postId: string; status: string; pollSeconds: number };

/** Opened mid-redraft (no job id to poll): check the post at the engine's interval and reload once its status changes. */
export function StatusWatcher({ locale, postId, status, pollSeconds }: Props) {
  useEffect(() => {
    const timer = setInterval(async () => {
      const result = await loadPostAction({ locale, postId });
      if (result.ok && result.data.status !== status) window.location.reload();
    }, pollSeconds * 1000);
    return () => clearInterval(timer);
  }, [locale, postId, status, pollSeconds]);
  return null;
}
