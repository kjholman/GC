"use client";

import { useState } from "react";
import { acceptAllSuggestionsAction, acceptSuggestionAction, dismissSuggestionAction } from "@/lib/knowledge/actions";
import { Button, Card, cx, inputCls } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";

export type SuggestionView = {
  id: string;
  kind: string;
  title: string;
  sourceLabel: string;
  fields: { key: string; label: string; value: string; current?: string | null; long?: boolean }[];
};

const KIND: Record<string, { label: string; cls: string }> = {
  PORTFOLIO_NEW: { label: "New portfolio company", cls: "bg-brand-100 text-brand-700" },
  PORTFOLIO_UPDATE: { label: "Portfolio details", cls: "bg-navy-50 text-navy-700" },
  PRINCIPLE: { label: "Investment principle", cls: "bg-pos-bg text-pos" },
  SETTING: { label: "Firm setting", cls: "bg-warn-bg text-warn" },
  PAST_DEAL: { label: "Past deal", cls: "bg-info-bg text-info" },
};

/** What GAIA found in uploaded documents or online: review, edit if needed, accept or dismiss. */
export function Suggestions({ items }: { items: SuggestionView[] }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!items.length) return null;
  return (
    <Card className="mb-8 !border-brand-300">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-1 text-brand-600">Found in your documents and online</div>
          <h2 className="font-display text-[22px] font-semibold text-navy-900">Suggestions to review ({items.length})</h2>
          <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
            GAIA read what was uploaded and suggests these additions. Nothing changes until you accept. Edit any value before accepting if it needs correcting.
          </p>
        </div>
        <Button
          disabled={!!busy}
          onClick={async () => {
            if (!(await confirm({ title: `Accept all ${items.length} suggestions?`, body: "Each is added exactly as shown. New portfolio companies are marked unverified until a partner checks them.", confirmLabel: "Accept all" }))) return;
            setBusy("all");
            const r = await acceptAllSuggestionsAction();
            setNote({ ok: r.ok, text: r.message ?? r.error ?? "" });
            setBusy(null);
          }}
        >
          {busy === "all" ? "Adding…" : "Accept all"}
        </Button>
      </div>
      {note && <p className={cx("mt-3 text-[13px]", note.ok ? "text-pos" : "text-neg")}>{note.text}</p>}
      <ul className="mt-5 space-y-3">
        {items.map((s) => (
          <SuggestionRow key={s.id} s={s} busy={busy === s.id} onBusy={(v) => setBusy(v ? s.id : null)} onDone={(ok, text) => setNote({ ok, text })} />
        ))}
      </ul>
    </Card>
  );
}

function SuggestionRow({ s, busy, onBusy, onDone }: { s: SuggestionView; busy: boolean; onBusy: (v: boolean) => void; onDone: (ok: boolean, text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(s.fields.map((f) => [f.key, f.value])));
  const kind = KIND[s.kind] ?? { label: s.kind, cls: "bg-paper text-muted" };
  return (
    <li className="rounded-lg border border-line bg-paper px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", kind.cls)}>{kind.label}</span>
          <div className="mt-1.5 text-[14.5px] font-medium text-navy-900">{s.title}</div>
          <div className="text-[11.5px] text-muted">From {s.sourceLabel}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[13px]">
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-navy-700 hover:underline">{editing ? "Done editing" : "Edit"}</button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              onBusy(true);
              await dismissSuggestionAction(s.id);
              onBusy(false);
            }}
            className="text-muted hover:text-neg"
          >
            Dismiss
          </button>
          <Button
            disabled={busy}
            onClick={async () => {
              onBusy(true);
              const r = await acceptSuggestionAction(s.id, values);
              onBusy(false);
              onDone(r.ok, r.message ?? r.error ?? "");
            }}
            className="!px-3 !py-1.5"
          >
            {busy ? "Adding…" : "Accept"}
          </Button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        {s.fields.map((f) => (
          <div key={f.key} className={cx(f.long && "sm:col-span-2")}>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{f.label}</dt>
            {editing ? (
              f.long ? (
                <textarea rows={3} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={inputCls} />
              ) : (
                <input value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} className={inputCls} />
              )
            ) : (
              <dd className="text-ink">
                {values[f.key]}
                {f.current && f.current !== values[f.key] && <span className="block text-[11.5px] text-muted">On record now: {f.current}</span>}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </li>
  );
}
