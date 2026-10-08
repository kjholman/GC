"use client";

import { useActionState, useState } from "react";
import { deletePrincipleAction, savePrincipleAction, togglePrincipleAction, type AdminState } from "@/lib/admin/actions";
import { Button, Card, cx, inputCls } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";
import { confirmLeave, hasUnsavedChanges } from "@/components/UnsavedGuard";
import { usePaged } from "@/components/Pager";

type P = { id: string; title: string; body: string; active: boolean };

export function Principles({ principles, canEdit }: { principles: P[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(savePrincipleAction.bind(null, null), { ok: false });
  const [k, setK] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const confirm = useConfirm();
  const { shown, offset, pager } = usePaged(principles, 15);
  return (
    <Card>
      <div className="eyebrow mb-1 text-brand-600">Applied to every analysis</div>
      <h2 className="font-display font-semibold text-[22px] text-navy-900">Investment principles</h2>
      <p className="mt-1.5 mb-5 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
        The partnership&apos;s standing rules and preferences. The analyst applies them to every screen and flags any conflict explicitly.
      </p>
      {principles.length === 0 && <p className="mb-5 text-[13px] text-muted">No principles recorded yet.</p>}
      <ol className="mb-6 divide-y divide-line">
        {shown.map((p, j) => { const i = offset + j; return (
          <li key={p.id} className={cx("flex gap-4 py-3.5", !p.active && "opacity-45")}>
            <span className="font-display font-semibold text-[17px] text-brand-500 tabular">{String(i + 1).padStart(2, "0")}</span>
            <div className="flex-1">
              {editing === p.id ? (
                <EditPrinciple p={p} onDone={() => setEditing(null)} />
              ) : (
                <>
                  <div className="text-[14px] font-medium text-navy-900">{p.title}</div>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-soft">{p.body}</p>
                </>
              )}
            </div>
            {canEdit && editing !== p.id && (
              <span className="flex shrink-0 gap-3 self-start text-[12px]">
              <button type="button" onClick={() => setEditing(p.id)} className="text-navy-700 hover:underline">Edit</button>
              <button
                type="button"
                onClick={async () => {
                  if (await confirm({ title: `Delete “${p.title}”?`, body: "Analyses stop applying it. The deletion is recorded in the change log.", confirmLabel: "Delete", danger: true }))
                    await deletePrincipleAction(p.id);
                }}
                className="text-neg hover:underline"
              >
                Delete
              </button>
              <button
                onClick={async () => {
                  const ok = await confirm(
                    p.active
                      ? { title: `Turn off “${p.title}”?`, body: "Analyses will stop applying this principle until it is turned back on.", confirmLabel: "Turn off", danger: true }
                      : { title: `Turn on “${p.title}”?`, body: "Every analysis from now on will apply this principle.", confirmLabel: "Turn on" },
                  );
                  if (ok) await togglePrincipleAction(p.id, !p.active);
                }} className="text-navy-700 hover:underline">
                {p.active ? "Turn off" : "Turn on"}
              </button>
              </span>
            )}
          </li>
        ); })}
      </ol>
      {pager}
      {canEdit && (
        <form data-unsaved-guard key={k} action={async (fd) => { await action(fd); setK((n) => n + 1); }} className="grid grid-cols-1 gap-3 border-t border-line pt-5 md:grid-cols-[240px_1fr_auto]">
          <input name="title" placeholder="e.g. Composition-of-matter IP" className={inputCls} />
          <input name="body" placeholder="e.g. We do not lead single-asset therapeutics deals without composition-of-matter protection." className={inputCls} />
          <Button type="submit" disabled={pending}>Add principle</Button>
          {(state.error || state.message) && (
            <p className={cx("text-[13px] md:col-span-3", state.error ? "text-neg" : "text-pos")}>{state.error ?? state.message}</p>
          )}
        </form>
      )}
    </Card>
  );
}

function EditPrinciple({ p, onDone }: { p: P; onDone: () => void }) {
  const confirm = useConfirm();
  const [state, action, pending] = useActionState<AdminState, FormData>(savePrincipleAction.bind(null, p.id), { ok: false });
  return (
    <form data-unsaved-guard action={async (fd) => { await action(fd); onDone(); }} className="space-y-2">
      <input name="title" defaultValue={p.title} className={inputCls} />
      <textarea name="body" defaultValue={p.body} rows={3} className={inputCls} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="!px-3 !py-1.5">Save</Button>
        <button
          type="button"
          onClick={async (e) => {
            if (hasUnsavedChanges(e.currentTarget.closest("form")?.parentElement) && !(await confirmLeave(confirm))) return;
            onDone();
          }}
          className="px-3 text-[13px] text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
      {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
    </form>
  );
}
