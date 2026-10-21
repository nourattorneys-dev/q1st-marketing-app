"use client";

import { Label } from "@/components/ui/label";
import { mapKeys } from "@/lib/settings/website-form";

const SELECT = "h-9 min-w-0 rounded-md border border-input bg-card px-3 text-sm";

type Props = {
  testId: string;
  title: string;
  hint: string;
  empty: string;
  notMapped: string;
  current: Record<string, string>;
  suggested: Record<string, string>;
  choices: string[];
  labelOf: (key: string) => string;
  onChange: (key: string, value: string) => void;
};

/** One row per part of the article: the saved keys, then any the last test suggested. The choices are the website's own fields from that test. */
export function MapEditor({ testId, title, hint, empty, notMapped, current, suggested, choices, labelOf, onChange }: Props) {
  const keys = mapKeys(current, suggested);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {keys.length === 0 && (
        <p data-testid={`${testId}-empty`} className="text-sm text-muted-foreground">
          {empty}
        </p>
      )}
      {keys.map((key) => {
        const value = current[key] ?? "";
        const options = [...new Set([...choices, ...(value ? [value] : [])])];
        return (
          <div key={key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3">
            <Label htmlFor={`${testId}-${key}`}>{labelOf(key)}</Label>
            <select id={`${testId}-${key}`} data-testid={`${testId}-${key}`} dir="ltr" className={SELECT} value={value} onChange={(event) => onChange(key, event.target.value)}>
              <option value="">{notMapped}</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </fieldset>
  );
}
