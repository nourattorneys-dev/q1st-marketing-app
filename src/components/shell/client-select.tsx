"use client";

import { useState, useTransition } from "react";
import { switchClientAction } from "@/lib/tenancy/actions";

type Props = { locale: string; label: string; failed: string; current: string; clients: { id: string; name: string }[] };

/** For someone who works for several clients: choosing one opens it (at its own address when it has one). */
export function ClientSelect({ locale, label, failed, current, clients }: Props) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  function choose(clientId: string) {
    setValue(clientId);
    setError(false);
    start(async () => {
      const result = await switchClientAction({ locale, clientId });
      if (result.ok) window.location.assign(result.data.href);
      else {
        setValue(current);
        setError(true);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={label}
        data-testid="client-switcher"
        className="h-9 max-w-56 rounded-md border border-input bg-card px-3 text-sm transition-opacity disabled:opacity-50"
        value={value}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
      >
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" data-testid="client-switcher-error" className="text-sm text-bad-fg">
          {failed}
        </span>
      )}
    </div>
  );
}
