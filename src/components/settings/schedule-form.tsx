"use client";

import { useTranslations } from "next-intl";
import { loadPublishingAction, savePublishingAction } from "@/app/[locale]/(app)/settings/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { PublishingSettings } from "@/lib/engine/schemas";
import { settingsFieldErrors } from "@/lib/settings/field-errors";
import { toPublishingUpdate, toScheduleForm, WEEK, withDay, type ScheduleForm } from "@/lib/settings/schedule-form";
import { FieldMessage, OtherFieldErrors, SaveBar, SaveFailure } from "./form-parts";
import { SettingsConflict } from "./settings-conflict";
import { useSettingsDraft } from "./use-settings-draft";

const FIELDS = ["autoPublish", "overrideReasonRequired", "perDay", "days", "from", "to", "gapMinutes"] as const;

/** Spec v1.1 §6 Publishing: on or off, posts a day, days, from and until, and the gap. The engine works out the slots. */
export function ScheduleSettingsForm({ locale, settings }: { locale: string; settings: PublishingSettings }) {
  const t = useTranslations("Settings.schedule");
  const save = useEngineAction(savePublishingAction);
  const draft = useSettingsDraft({
    saved: settings,
    toForm: toScheduleForm,
    save: async (form, version) => {
      const update = toPublishingUpdate(form, version);
      if (!update.ok) {
        const fields = Object.fromEntries(update.invalid.map((key) => [key, t("wholeNumber")]));
        return { ok: false as const, error: { status: 400, code: "invalid_input", message: t("wholeNumber"), fields } };
      }
      return save.run({ locale, update: update.update });
    },
    load: () => loadPublishingAction({ locale }),
  });
  const form = draft.form;
  const conflict = draft.conflict;
  const errors = settingsFieldErrors(draft.error, FIELDS);
  const set = <K extends keyof ScheduleForm>(key: K, value: ScheduleForm[K]) => draft.update((current) => ({ ...current, [key]: value }));
  const dayNames = (days: string[]) => days.map((day) => (t.has(`dayNames.${day}`) ? t(`dayNames.${day}`) : day));

  const numberField = (key: "perDay" | "gapMinutes", testId: string, min: number) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={testId}>{t(key)}</Label>
      <Input id={testId} data-testid={testId} type="number" inputMode="numeric" min={min} step={1} dir="ltr" value={form[key]} onChange={(event) => set(key, event.target.value)} />
      <FieldMessage field={key} message={errors.byField[key]} />
    </div>
  );
  const timeField = (key: "from" | "to", testId: string) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={testId}>{t(key)}</Label>
      <Input id={testId} data-testid={testId} type="time" dir="ltr" value={form[key]} onChange={(event) => set(key, event.target.value)} />
      <FieldMessage field={key} message={errors.byField[key]} />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {conflict && (
          <SettingsConflict
            rows={conflict.keys.map((key) => ({
              key,
              label: t(key),
              theirs: key === "days" ? dayNames(conflict.theirs.days) : conflict.theirs[key],
              mine: key === "days" ? dayNames(form.days) : form[key],
            }))}
            pending={draft.pending}
            onLoadTheirs={draft.loadTheirs}
            onKeepMine={() => void draft.keepMine()}
          />
        )}
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            data-testid="schedule-auto-publish"
            checked={form.autoPublish}
            onChange={(event) => set("autoPublish", event.target.checked)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{t("autoPublish")}</span>
            <span className="text-xs text-muted-foreground">{t("autoPublishHint")}</span>
          </span>
        </label>
        <FieldMessage field="autoPublish" message={errors.byField.autoPublish} />
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            data-testid="schedule-reason-required"
            checked={form.reasonRequired}
            onChange={(event) => set("reasonRequired", event.target.checked)}
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">{t("reasonRequired")}</span>
            <span className="text-xs text-muted-foreground">{t("reasonRequiredHint")}</span>
          </span>
        </label>
        <FieldMessage field="overrideReasonRequired" message={errors.byField.overrideReasonRequired} />
        <div className="grid gap-4 sm:grid-cols-2">
          {numberField("perDay", "schedule-per-day", 1)}
          {numberField("gapMinutes", "schedule-gap", 0)}
          {timeField("from", "schedule-from")}
          {timeField("to", "schedule-to")}
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("days")}</legend>
          <div className="flex flex-wrap gap-4">
            {WEEK.map((day) => (
              <label key={day} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  data-testid={`schedule-day-${day}`}
                  checked={form.days.includes(day)}
                  onChange={(event) => {
                    const on = event.target.checked;
                    draft.update((current) => withDay(current, day, on));
                  }}
                />
                <span data-testid={`schedule-day-label-${day}`}>{t(`dayNames.${day}`)}</span>
              </label>
            ))}
          </div>
          <FieldMessage field="days" message={errors.byField.days} />
        </fieldset>
        <OtherFieldErrors items={errors.other} />
        <SaveFailure error={draft.error} />
        <SaveBar
          onSave={() => void draft.save()}
          pending={draft.pending}
          disabled={draft.unsaved.length === 0}
          unsaved={draft.unsaved.length > 0}
          savedNow={draft.savedNow}
        />
      </CardContent>
    </Card>
  );
}
