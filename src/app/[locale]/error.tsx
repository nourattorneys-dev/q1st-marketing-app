"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

/**
 * Errors in the app frame itself (sidebar, user menu, banner: they read the session) land here, below the root layout,
 * so the message is still translated and right to left in Arabic (M1/M2b follow-up).
 */
export default function LocaleError(props: { error: unknown; retry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <ErrorPanel {...props} />
    </main>
  );
}
