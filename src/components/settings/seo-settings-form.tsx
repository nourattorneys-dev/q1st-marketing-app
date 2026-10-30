"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { loadSeoAction, proposeSeoAction, saveSeoAction } from "@/app/[locale]/(app)/settings/actions";
import { ActionFailure } from "@/components/actions/action-failure";
import { JobTracker } from "@/components/jobs/job-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEngineAction } from "@/lib/actions/use-engine-action";
import type { EngineFailure } from "@/lib/engine/result";
import type { SeoSettings } from "@/lib/engine/schemas";
import { settingsFieldErrors } from "@/lib/settings/field-errors";
import { readProposal, SEO_LISTS, toSeoForm, toSeoUpdate, withProposal, type SeoForm } from "@/lib/settings/seo-form";
import { FieldMessage, OtherFieldErrors, SaveBar, SaveFailure } from "./form-parts";
import { SettingsConflict } from "./settings-conflict";
import { useSettingsDraft } from "./use-settings-draft";

const SELECT = "h-9 rounded-md border border-input bg-card px-3 text-sm";
const GROUPS = [
  { key: "site", fields: ["siteName", "siteUrl", "blogPath", "defaultLang", "author"] },
  { key: "profile", fields: ["services", "audience", "locations", "focusKeywords", "cta", "tone", "avoid"] },
  { key: "links", fields: ["linkedin", "instagram", "ogImage"] },
] as const satisfies readonly { key: string; fields: readonly (keyof SeoForm)[] }[];
const FIELDS: readonly string[] = GROUPS.flatMap((group) => group.fields);
const LISTS = new Set<keyof SeoForm>(SEO_LISTS);
const ADDRESSES = new Set<keyof SeoForm>(["siteUrl", "linkedin", "instagram", "ogImage"]);

type Props = { locale: string; settings: SeoSettings; languages: string[]; pollSeconds: number; canRequestUpgrade: boolean };

/** Spec v1.1 §6 SEO: the site's profile, which the AI writes from, with AI suggestions for focus keywords and the call to action. */
export function SeoSettingsForm({ locale, settings, languages, pollSeconds, canRequestUpgrade }: Props) {
  const t = useTranslations("Settings.seo");
  const tReview = useTranslations("Review");
  const save = useEngineAction(saveSeoAction);
  const propose = useEngineAction(proposeSeoAction);
  const [proposalJob, setProposalJob] = useState<string | null>(null);
  const [proposal, setProposal] = useState<"filled" | "nothing" | "unreadable" | null>(null);
  const [filledCount, setFilledCount] = useState(0);
  const [proposeError, setProposeError] = useState<EngineFailure | null>(null);
  const draft = useSettingsDraft({
    saved: settings,
    toForm: toSeoForm,
    save: (form, version) => save.run({ locale, update: toSeoUpdate(form, version) }),
    load: () => loadSeoAction({ locale }),
  });
  const form = draft.form;
  const conflict = draft.conflict;
  const errors = settingsFieldErrors(draft.error, FIELDS);
  const set = (key: keyof SeoForm, value: string) => draft.update((current) => ({ ...current, [key]: value }));

  async function startProposal() {
    setProposal(null);
    setProposeError(null);
    const result = await propose.run({ locale });
    if (result.ok) setProposalJob(result.data.jobId);
    else setProposeError(result.error);
  }

  function proposalDone(result: unknown) {
    const read = readProposal(result);
    if (!read) {
      setProposal("unreadable");
      return;
    }
    const next = withProposal(form, read);
    setFilledCount(next.filled.length);
    setProposal(next.filled.length > 0 ? "filled" : "nothing");
    if (next.filled.length > 0) draft.update(() => next.form);
  }

  function field(key: keyof SeoForm) {
    const id = `seo-${key}`;
    return (
      <div key={key} className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{t(`fields.${key}`)}</Label>
        {key === "defaultLang" ? (
          <select id={id} data-testid={id} className={SELECT} value={form.defaultLang} onChange={(event) => set("defaultLang", event.target.value)}>
            {languages.map((code) => (
              <option key={code} value={code}>
                {tReview.has(`languages.${code}`) ? tReview(`languages.${code}`) : code}
              </option>
            ))}
          </select>
        ) : LISTS.has(key) ? (
          <Textarea id={id} data-testid={id} dir="auto" rows={2} value={form[key]} onChange={(event) => set(key, event.target.value)} />
        ) : (
          <Input
            id={id}
            data-testid={id}
            type={ADDRESSES.has(key) ? "url" : "text"}
            dir={ADDRESSES.has(key) ? "ltr" : "auto"}
            value={form[key]}
            onChange={(event) => set(key, event.target.value)}
          />
        )}
        {LISTS.has(key) && <p className="text-xs text-muted-foreground">{t("listHint")}</p>}
        <FieldMessage field={key} message={errors.byField[key]} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {conflict && (
          <SettingsConflict
            rows={conflict.keys.map((key) => ({ key, label: t(`fields.${key}`), theirs: conflict.theirs[key], mine: form[key] }))}
            pending={draft.pending}
            onLoadTheirs={draft.loadTheirs}
            onKeepMine={() => void draft.keepMine()}
          />
        )}
        {GROUPS.map((group) => (
          <fieldset key={group.key} className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">{t(`groups.${group.key}`)}</legend>
            {group.key === "profile" && <p className="text-xs text-muted-foreground">{t("profileHint")}</p>}
            <div className="grid gap-4 sm:grid-cols-2">{group.fields.map((key) => field(key))}</div>
            {group.key === "profile" && (
              <div className="flex flex-col gap-2">
                <div>
                  <Button type="button" variant="outline" size="sm" data-testid="seo-propose" disabled={propose.pending} onClick={() => void startProposal()}>
                    {t("propose")}
                  </Button>
                </div>
                {proposalJob && (
                  <JobTracker key={proposalJob} jobId={proposalJob} pollSeconds={pollSeconds} label={t("proposing")} testId="seo-propose-job" onDone={proposalDone} />
                )}
                {proposal === "filled" && (
                  <p role="status" data-testid="seo-proposed" className="text-sm text-ok-fg">
                    {t("proposed", { count: filledCount })}
                  </p>
                )}
                {proposal === "nothing" && (
                  <p role="status" data-testid="seo-proposed-nothing" className="text-sm text-muted-foreground">
                    {t("proposedNothing")}
                  </p>
                )}
                {proposal === "unreadable" && (
                  <p role="alert" data-testid="seo-proposal-unreadable" className="text-sm text-bad-fg">
                    {t("proposalUnreadable")}
                  </p>
                )}
                {proposeError && <ActionFailure error={proposeError} locale={locale} canRequestUpgrade={canRequestUpgrade} />}
              </div>
            )}
          </fieldset>
        ))}
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
