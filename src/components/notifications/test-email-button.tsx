"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { sendTestEmailAction } from "@/app/[locale]/(app)/notifications/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions/result";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { MAIL_ERROR_KINDS } from "@/lib/notifications/mail-error";

type Outcome = ActionResult<{ to: string; sent: boolean }>;

/** M5b: an Admin emails themselves a test, to check that this server's emails work. */
export function TestEmailButton({ locale }: { locale: string }) {
  const t = useTranslations("Notifications.testEmail");
  const send = useEngineAction(sendTestEmailAction);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function press() {
    setOutcome(null);
    setOutcome(await send.run({ locale }));
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button variant="outline" data-testid="test-email-send" disabled={send.pending} onClick={() => void press()}>
          {send.pending ? t("sending") : t("button")}
        </Button>
      </div>
      {outcome && <TestEmailResult outcome={outcome} />}
    </div>
  );
}

function TestEmailResult({ outcome }: { outcome: Outcome }) {
  const t = useTranslations("Notifications.testEmail");
  if (outcome.ok) {
    return (
      <p role="status" data-testid="test-email-result" data-state={outcome.data.sent ? "sent" : "log"} className={outcome.data.sent ? "text-ok-fg" : "text-muted-foreground"}>
        {outcome.data.sent ? t("sent", { email: outcome.data.to }) : t("logMode")}
      </p>
    );
  }
  if (outcome.error.code !== "mail_failed") return <ActionError error={outcome.error} />;
  const kind = MAIL_ERROR_KINDS.find((each) => each === outcome.error.details?.kind) ?? "other";
  const reply = outcome.error.details?.reply;
  return (
    <p role="alert" data-testid="test-email-result" data-state="failed" data-kind={kind} className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
      {t(`failed.${kind}`)}
      {typeof reply === "string" && reply ? (
        <>
          {" "}
          <bdi>({reply})</bdi>
        </>
      ) : null}
    </p>
  );
}
