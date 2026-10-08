"use client";

import { useActionState, useState } from "react";
import { deleteFundingStageAction, saveFundingStageAction, type StageState } from "@/lib/training/stageActions";
import { STAGE_FIELDS, STAGE_SCOPE } from "@/lib/training/stages";
import { Button, Card, cx, inputCls } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";
import { confirmLeave, hasUnsavedChanges } from "@/components/UnsavedGuard";

type Stage = {
  id: string;
  name: string;
  scope: string;
  confirmed: boolean;
  updatedAt: string;
  actual: string[];
} & Partial<Record<(typeof STAGE_FIELDS)[number]["key"], string | null>>;

export function StageList({ stages, canEdit }: { stages: Stage[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-5">
      {stages.map((s) => (
        <StageCard key={s.id} s={s} canEdit={canEdit} />
      ))}
      {canEdit &&
        (adding ? (
          <Card>
            <StageForm onDone={() => setAdding(false)} />
          </Card>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="w-full rounded-xl border border-dashed border-line-strong py-4 text-[13.5px] font-medium text-navy-700 hover:border-navy-700">
            + Add a stage (for example Bridge, Venture debt or Crossover)
          </button>
        ))}
    </div>
  );
}

function StageCard({ s, canEdit }: { s: Stage; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const confirm = useConfirm();
  const scope = STAGE_SCOPE[s.scope] ?? STAGE_SCOPE.CORE;
  if (editing) {
    return (
      <Card>
        <StageForm s={s} onDone={() => setEditing(false)} />
      </Card>
    );
  }
  const terms = STAGE_FIELDS.filter((f) => !f.long);
  const detail = STAGE_FIELDS.filter((f) => f.long && s[f.key]);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-[22px] font-semibold text-navy-900">{s.name}</h3>
          <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", scope.cls)}>{scope.label}</span>
          {!s.confirmed && <span className="text-[11.5px] text-warn">● Starting values; not yet confirmed</span>}
        </div>
        {canEdit && (
          <span className="flex gap-3 text-[12.5px]">
            <button type="button" onClick={() => setEditing(true)} className="font-medium text-navy-700 hover:underline">
              {s.confirmed ? "Edit" : "Review and confirm"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await confirm({ title: `Remove ${s.name}?`, body: "GAIA stops benchmarking deals at this stage. The removal is recorded and can be undone.", confirmLabel: "Remove", danger: true }))
                  await deleteFundingStageAction(s.id);
              }}
              className="text-neg hover:underline"
            >
              Remove
            </button>
          </span>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] md:grid-cols-5">
        {terms.map((f) => (
          <div key={f.key}>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{f.label}</dt>
            <dd className="mt-0.5 text-ink">{s[f.key] || <span className="text-muted">Not set</span>}</dd>
          </div>
        ))}
      </dl>
      {detail.length > 0 && (
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 border-t border-line pt-4 text-[13px] md:grid-cols-2">
          {detail.map((f) => (
            <div key={f.key}>
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{f.label}</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-soft">{s[f.key]}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 border-t border-line pt-3 text-[12.5px] text-muted">
        {s.actual.length ? (
          <>
            <span className="font-medium text-ink">What Genesys did at this stage: </span>
            {s.actual.join("; ")}
          </>
        ) : (
          "No portfolio companies are recorded as entering at this stage yet. Set the entry stage on portfolio records to see them here."
        )}
      </div>
    </Card>
  );
}

function StageForm({ s, onDone }: { s?: Stage; onDone: () => void }) {
  const confirm = useConfirm();
  const [state, action, pending] = useActionState<StageState, FormData>(async (prev, fd) => {
    const r = await saveFundingStageAction(s?.id ?? null, prev, fd);
    if (r.ok) onDone();
    return r;
  }, { ok: false });
  return (
    <form data-unsaved-guard action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]">
        <label className="block">
          <span className="text-[12px] font-medium text-ink">Stage name</span>
          <input name="name" defaultValue={s?.name ?? ""} placeholder="e.g. Seed" className={inputCls} />
        </label>
        <label className="block">
          <span className="text-[12px] font-medium text-ink">How Genesys treats it</span>
          <select name="scope" defaultValue={s?.scope ?? "CORE"} className={inputCls}>
            <option value="CORE">Core focus</option>
            <option value="SELECTIVE">Selective</option>
            <option value="OUT">Follow-on only</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {STAGE_FIELDS.map((f) => (
          <label key={f.key} className={cx("block", f.long && "md:col-span-2")}>
            <span className="text-[12px] font-medium text-ink">{f.label}</span>
            {f.long ? (
              <textarea name={f.key} defaultValue={s?.[f.key] ?? ""} placeholder={f.placeholder} rows={2} className={inputCls} />
            ) : (
              <input name={f.key} defaultValue={s?.[f.key] ?? ""} placeholder={f.placeholder} className={inputCls} />
            )}
          </label>
        ))}
      </div>
      {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : s ? "Save and confirm" : "Add stage"}</Button>
        <button
          type="button"
          onClick={async (e) => {
            const form = e.currentTarget.closest("form");
            if (hasUnsavedChanges(form?.parentElement) && !(await confirmLeave(confirm))) return;
            form?.removeAttribute("data-dirty");
            onDone();
          }}
          className="text-[13px] text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
