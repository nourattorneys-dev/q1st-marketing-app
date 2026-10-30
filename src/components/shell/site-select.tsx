"use client";

import { useState, useTransition } from "react";
import { selectSiteAction } from "@/lib/tenancy/actions";

type Props = { locale: string; label: string; failed: string; current: string; sites: { id: string; name: string }[] };

export function SiteSelect({ locale, label, failed, current, sites }: Props) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  function choose(siteId: string) {
    setValue(siteId);
    setError(false);
    start(async () => {
      const result = await selectSiteAction({ locale, siteId });
      // The same page, now for the chosen site: a full load, so every view reads that site's data.
      if (result.ok) window.location.reload();
      else {
        setValue(current);
        setError(true);
      }
    });
  }

  return (
    <div className="me-auto flex items-center gap-2">
      <select
        aria-label={label}
        data-testid="site-switcher"
        className="h-9 max-w-64 rounded-md border border-input bg-card px-3 text-sm transition-opacity disabled:opacity-50"
        value={value}
        disabled={pending}
        onChange={(event) => choose(event.target.value)}
      >
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" data-testid="site-switcher-error" className="text-sm text-bad-fg">
          {failed}
        </span>
      )}
    </div>
  );
}
