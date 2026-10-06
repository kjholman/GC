"use client";

import { useActionState, useState } from "react";
import { savePrincipleAction, togglePrincipleAction, type AdminState } from "@/lib/admin/actions";
import { Button, Card, cx, inputCls } from "@/components/ui";

type P = { id: string; title: string; body: string; active: boolean };

export function Principles({ principles, canEdit }: { principles: P[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(savePrincipleAction.bind(null, null), { ok: false });
  const [k, setK] = useState(0);
  return (
    <Card>
      <div className="eyebrow mb-1 text-brand-600">Applied to every analysis</div>
      <h2 className="font-display font-semibold text-[22px] text-navy-900">Investment principles</h2>
      <p className="mt-1.5 mb-5 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
        The partnership&apos;s standing rules and preferences. The analyst applies them to every screen and flags any conflict explicitly.
      </p>
      {principles.length === 0 && <p className="mb-5 text-[13px] text-muted">No principles recorded yet.</p>}
      <ol className="mb-6 divide-y divide-line">
        {principles.map((p, i) => (
          <li key={p.id} className={cx("flex gap-4 py-3.5", !p.active && "opacity-45")}>
            <span className="font-display font-semibold text-[17px] text-brand-500 tabular">{String(i + 1).padStart(2, "0")}</span>
            <div className="flex-1">
              <div className="text-[14px] font-medium text-navy-900">{p.title}</div>
              <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink-soft">{p.body}</p>
            </div>
            {canEdit && (
              <button onClick={() => togglePrincipleAction(p.id, !p.active)} className="self-start text-[12px] text-navy-700 hover:underline">
                {p.active ? "Disable" : "Enable"}
              </button>
            )}
          </li>
        ))}
      </ol>
      {canEdit && (
        <form key={k} action={async (fd) => { await action(fd); setK((n) => n + 1); }} className="grid gap-3 border-t border-line pt-5 md:grid-cols-[240px_1fr_auto]">
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
