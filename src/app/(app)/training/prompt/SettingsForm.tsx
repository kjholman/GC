"use client";

import { useActionState } from "react";
import { saveFirmSettingsAction, type TrainState } from "@/lib/training/actions";
import { Button, cx, inputCls } from "@/components/ui";
import { useConfirmSubmit } from "@/components/Confirm";

type S = { key: string; label: string; help: string; value: string; confirmed: boolean };

export function SettingsForm({ settings, canEdit }: { settings: S[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState<TrainState, FormData>(saveFirmSettingsAction, { ok: false });
  const confirmSave = useConfirmSubmit({
    title: "Save the firm settings?",
    body: "Every analysis from now on is measured against these settings. Changes are recorded in the change history.",
    confirmLabel: "Save settings",
  });
  return (
    <form data-unsaved-guard
      action={action}
      onSubmit={confirmSave}
      className="space-y-5"
    >
      {settings.map((s) => (
        <div key={s.key} className="grid grid-cols-1 gap-2 md:grid-cols-[240px_1fr]">
          <div>
            <div className="text-[13.5px] font-medium text-navy-900">{s.label}</div>
            <div className="text-[12px] text-muted">{s.help}</div>
            {!s.confirmed && <div className="mt-1 text-[11.5px] text-warn">● Starting value; not yet confirmed by a partner</div>}
          </div>
          <textarea name={s.key} defaultValue={s.value} rows={2} disabled={!canEdit} className={inputCls} />
        </div>
      ))}
      {(state.error || state.message) && <p className={cx("text-[13px]", state.error ? "text-neg" : "text-pos")}>{state.error ?? state.message}</p>}
      {canEdit && <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save and confirm settings"}</Button>}
    </form>
  );
}
