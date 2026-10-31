"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ActionError } from "@/components/actions/action-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EngineFailure } from "@/lib/engine/result";

type Props = {
  testId: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "secondary" | "destructive";
  disabled?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  note?: { label: string; required: boolean };
  pending: boolean;
  onConfirm: (note: string, option: boolean) => Promise<EngineFailure | null>;
  /** A not_connected refusal links an admin to Settings (design §9). */
  canManageSettings?: boolean;
  /** Shown on the confirm button while the action runs (a spinner always shows); default "Working…". */
  pendingLabel?: string;
  /** An extra yes/no the person can change before confirming (passed to onConfirm). */
  option?: { label: string; defaultChecked: boolean };
};

export function ConfirmDialog({ testId, triggerLabel, triggerVariant = "outline", disabled, title, description, confirmLabel, note, pending, onConfirm, canManageSettings, pendingLabel, option }: Props) {
  const t = useTranslations("Editor");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(option?.defaultChecked ?? false);
  const [error, setError] = useState<EngineFailure | null>(null);
  const missingNote = note?.required === true && !text.trim();

  async function confirm() {
    const failure = await onConfirm(text.trim(), checked);
    setError(failure);
    if (!failure) {
      setOpen(false);
      setText("");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={triggerVariant} data-testid={testId} disabled={disabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {note && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${testId}-note`}>{note.label}</Label>
            <Textarea id={`${testId}-note`} data-testid={`${testId}-note`} rows={3} value={text} onChange={(event) => setText(event.target.value)} />
          </div>
        )}
        {option && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" data-testid={`${testId}-option`} checked={checked} onChange={(event) => setChecked(event.target.checked)} />
            {option.label}
          </label>
        )}
        {error && <ActionError error={error} canManageSettings={canManageSettings} />}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button data-testid={`${testId}-confirm`} disabled={missingNote || pending} aria-busy={pending} onClick={() => void confirm()}>
            {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {pending ? (pendingLabel ?? t("working")) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
