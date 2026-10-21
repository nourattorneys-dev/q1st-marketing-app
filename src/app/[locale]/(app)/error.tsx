"use client";

import { ErrorPanel } from "@/components/shell/error-panel";

/** The app pages' error boundary: the page area shows the message, and the sidebar and top bar stay. */
export default function AppError(props: { error: unknown; retry: () => void }) {
  return <ErrorPanel {...props} />;
}
