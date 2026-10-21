"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { loadWebsiteAction, saveWebsiteAction, testWebsiteAction } from "@/app/[locale]/(app)/settings/actions";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import { engineNoticeKey } from "@/lib/engine/notice";
import type { EngineFailure } from "@/lib/engine/result";
import type { PublishTarget, TargetField, TargetType, WebsiteTest } from "@/lib/engine/schemas";
import { settingsFieldErrors } from "@/lib/settings/field-errors";
import {
  connectionFingerprint,
  missingRequired,
  needsTest,
  prefillMap,
  switchType,
  textOf,
  toWebsiteForm,
  toWebsiteTarget,
  toWebsiteUpdate,
  typeOf,
  type WebsiteForm,
} from "@/lib/settings/website-form";
import { FieldMessage, OtherFieldErrors, SaveBar, SaveFailure } from "./form-parts";
import { MapEditor } from "./map-editor";
import { SettingsConflict } from "./settings-conflict";
import { useSettingsDraft } from "./use-settings-draft";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm";

type Props = { locale: string; saved: PublishTarget; types: TargetType[]; lastChecked: string | null };
type TestRun = { fingerprint: string; type: string; result: WebsiteTest };

/** Spec v1.1 §6 Website, drawn entirely from /meta.targetTypes. A changed connection is saved only after its test passes (§10). */
export function WebsiteSettingsForm({ locale, saved, types, lastChecked }: Props) {
  const t = useTranslations("Settings.website");
  const router = useRouter();
  const save = useEngineAction(saveWebsiteAction);
  const test = useEngineAction(testWebsiteAction);
  const [firstRun] = useState(saved.status === "missing");
  const [run, setRun] = useState<TestRun | null>(null);
  const [testError, setTestError] = useState<EngineFailure | null>(null);
  const draft = useSettingsDraft({
    saved,
    toForm: (target: PublishTarget) => toWebsiteForm(target, types),
    save: (form, version) => save.run({ locale, update: toWebsiteUpdate(form, types, version) }),
    load: () => loadWebsiteAction({ locale }),
  });
  const form = draft.form;
  const conflict = draft.conflict;
  const type = typeOf(types, form.type);
  const fingerprint = connectionFingerprint(form, types);
  const lastTest = run?.fingerprint === fingerprint ? run.result : null;
  // The last passing test of this type gives the website's own fields and blocks as the maps' choices.
  const adapter = run && run.type === form.type && run.result.ok ? run.result : null;
  const testNeeded = needsTest(form, saved, types);
  const missing = missingRequired(form, saved, types);
  const secretKept = saved.secretSet && saved.type === form.type;
  const canSave = draft.unsaved.length > 0 && missing.length === 0 && (!testNeeded || lastTest?.ok === true);
  const errors = settingsFieldErrors(draft.error ?? testError, [...(type?.fields.map((field) => field.key) ?? []), "type", "body.format", "arabic.mode"]);

  // English shows the engine's own labels; another language shows ours for the keys we know (Global Constraints).
  const fieldLabel = (field: TargetField) => (locale !== "en" && t.has(`fieldLabels.${field.key}`) ? t(`fieldLabels.${field.key}`) : field.label);
  const choiceLabel = (group: "bodyFormats" | "arabicModes" | "mapKeys", code: string) => (t.has(`${group}.${code}`) ? t(`${group}.${code}`) : code);
  const change = (next: (current: WebsiteForm) => WebsiteForm) => draft.update(next);
  const setMap = (map: "fieldMap" | "blockMap") => (key: string, value: string) => change((current) => ({ ...current, [map]: { ...current[map], [key]: value } }));

  async function runTest() {
    setTestError(null);
    const tested = { fingerprint, type: form.type };
    const result = await test.run({ locale, target: toWebsiteTarget(form, types) });
    if (!result.ok) {
      // The latest test didn't pass, so an earlier passing result no longer counts.
      setRun(null);
      setTestError(result.error);
      return;
    }
    const outcome = result.data;
    setRun({ ...tested, result: outcome });
    if (outcome.ok) {
      change((current) => ({
        ...current,
        fieldMap: prefillMap(current.fieldMap, outcome.suggestedFieldMap, outcome.fields),
        blockMap: prefillMap(current.blockMap, outcome.suggestedBlockMap, outcome.blockTypes),
      }));
    }
  }

  async function saveNow() {
    setTestError(null);
    const done = await draft.save();
    // Spec v1.1 §6 first-run setup: the website connection first, then the social accounts.
    if (done && firstRun) router.push("/settings/social");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div data-testid="website-status" data-status={saved.status} className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">{t.has(`statuses.${saved.status}`) ? t(`statuses.${saved.status}`) : saved.status}</span>
          {lastChecked && (
            <span data-testid="website-last-checked" className="text-muted-foreground">
              {t("lastChecked", { time: lastChecked })}
            </span>
          )}
          {saved.lastError && <span className="text-bad-fg">{t("lastError", { error: saved.lastError })}</span>}
        </div>
        {conflict && (
          <SettingsConflict
            rows={conflict.keys
              .filter((key) => key !== "secret")
              .map((key) => ({ key, label: t(`formKeys.${key}`), theirs: conflict.theirs[key], mine: form[key] }))}
            pending={draft.pending}
            onLoadTheirs={draft.loadTheirs}
            onKeepMine={() => void draft.keepMine()}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="website-type">{t("type")}</Label>
          <select
            id="website-type"
            data-testid="website-type"
            className={SELECT}
            value={form.type}
            onChange={(event) => {
              const next = event.target.value;
              change((current) => switchType(current, next, types));
            }}
          >
            {types.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldMessage field="type" message={errors.byField.type} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {type?.fields.map((field) => {
            const id = `website-field-${field.key}`;
            const isSecret = field.kind === "secret";
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>
                  {fieldLabel(field)}
                  {field.required ? " *" : ""}
                </Label>
                <Input
                  id={id}
                  data-testid={id}
                  dir="ltr"
                  type={isSecret ? "password" : field.kind === "url" ? "url" : "text"}
                  autoComplete={isSecret ? "new-password" : "off"}
                  value={isSecret ? form.secret : textOf(form.settings[field.key])}
                  onChange={(event) => {
                    const value = event.target.value;
                    change((current) => (isSecret ? { ...current, secret: value } : { ...current, settings: { ...current.settings, [field.key]: value } }));
                  }}
                />
                {isSecret && secretKept && (
                  <p data-testid="website-secret-kept" className="text-xs text-muted-foreground">
                    {t("secretKept")}
                  </p>
                )}
                <FieldMessage field={field.key} message={errors.byField[field.key]} />
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <div>
            <Button type="button" variant="outline" data-testid="website-test" disabled={test.pending || missing.length > 0} onClick={() => void runTest()}>
              {test.pending ? t("testing") : t("test")}
            </Button>
          </div>
          {lastTest &&
            (lastTest.ok ? (
              <p role="status" data-testid="website-test-result" data-ok="true" className="rounded-md bg-ok-bg px-3 py-2 text-sm text-ok-fg">
                {t("testOk")}
              </p>
            ) : (
              <p role="alert" data-testid="website-test-result" data-ok="false" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
                {t("testFailed", { error: lastTest.error ?? "" })}
              </p>
            ))}
          {testNeeded && lastTest?.ok !== true && (
            <p data-testid="website-needs-test" className="text-sm text-muted-foreground">
              {t("needsTest")}
            </p>
          )}
          {testError &&
            (testError.fields && Object.keys(testError.fields).length > 0 ? (
              <SaveFailure error={testError} />
            ) : engineNoticeKey(testError.code) ? (
              <ActionError error={testError} />
            ) : (
              // A refused test (e.g. 422 not_connected, spec v1.1 §9) shows the engine's own reason (§10).
              <p role="alert" data-testid="website-test-result" data-ok="false" className="rounded-md bg-bad-bg px-3 py-2 text-sm text-bad-fg">
                {t("testFailed", { error: testError.message })}
              </p>
            ))}
        </div>
        <MapEditor
          testId="field-map"
          title={t("fieldMap")}
          hint={t("fieldMapHint")}
          empty={t("mapEmpty")}
          notMapped={t("notMapped")}
          current={form.fieldMap}
          suggested={adapter?.suggestedFieldMap ?? {}}
          choices={adapter?.fields ?? []}
          labelOf={(key) => choiceLabel("mapKeys", key)}
          onChange={setMap("fieldMap")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="website-body-format">{t("bodyFormat")}</Label>
            <select
              id="website-body-format"
              data-testid="website-body-format"
              className={SELECT}
              value={form.bodyFormat}
              onChange={(event) => {
                const value = event.target.value;
                change((current) => ({ ...current, bodyFormat: value }));
              }}
            >
              {(type?.bodyFormats ?? []).map((code) => (
                <option key={code} value={code}>
                  {choiceLabel("bodyFormats", code)}
                </option>
              ))}
            </select>
            <FieldMessage field="body.format" message={errors.byField["body.format"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="website-arabic-mode">{t("arabicMode")}</Label>
            <select
              id="website-arabic-mode"
              data-testid="website-arabic-mode"
              className={SELECT}
              value={form.arabicMode}
              onChange={(event) => {
                const value = event.target.value;
                change((current) => ({ ...current, arabicMode: value }));
              }}
            >
              {(type?.arabicModes ?? []).map((code) => (
                <option key={code} value={code}>
                  {choiceLabel("arabicModes", code)}
                </option>
              ))}
            </select>
            <FieldMessage field="arabic.mode" message={errors.byField["arabic.mode"]} />
          </div>
        </div>
        {form.bodyFormat === "blocks" && (
          <MapEditor
            testId="block-map"
            title={t("blockMap")}
            hint={t("blockMapHint")}
            empty={t("mapEmpty")}
            notMapped={t("notMapped")}
            current={form.blockMap}
            suggested={adapter?.suggestedBlockMap ?? {}}
            choices={adapter?.blockTypes ?? []}
            labelOf={(key) => choiceLabel("mapKeys", key)}
            onChange={setMap("blockMap")}
          />
        )}
        <OtherFieldErrors items={errors.other} />
        <SaveFailure error={draft.error} />
        <SaveBar onSave={() => void saveNow()} pending={draft.pending} disabled={!canSave} unsaved={draft.unsaved.length > 0} savedNow={draft.savedNow} />
      </CardContent>
    </Card>
  );
}
