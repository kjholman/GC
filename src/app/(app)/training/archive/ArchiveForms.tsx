"use client";

import { useActionState, useState } from "react";
import { addHistoricalDealAction, deleteHistoricalDealAction, importArchiveCsvAction, retryIngestAction, type TrainState, addPastDealToPortfolioAction, attachDeckAction } from "@/lib/training/actions";
import { Button, Card, Field, cx, inputCls } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";

function Status({ s }: { s: TrainState }) {
  if (!s.error && !s.message) return null;
  return <p className={cx("text-[13px]", s.error ? "text-neg" : "text-pos")}>{s.error ?? s.message}</p>;
}

export function ImportCsvForm() {
  const [state, action, pending] = useActionState<TrainState, FormData>(importArchiveCsvAction, { ok: false });
  return (
    <Card>
      <div className="eyebrow mb-1 text-brand-600">Bulk import</div>
      <h3 className="font-display font-semibold text-[20px] text-navy-900">Import past deals</h3>
      <p className="mt-1.5 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
        Fill in the template (Excel or CSV) with one row per deal, and attach any files. Each file is matched to its row by the file name in the “deck_filename” column; list several names separated by semicolons. Decisions can be written plainly, e.g. “Invested” or “Passed at screening”.{" "}
        Template: <a href="/api/templates/past-deals?format=xlsx" download className="text-navy-700 underline">Excel</a> ·{" "}
        <a href="/api/templates/past-deals?format=csv" download className="text-navy-700 underline">CSV</a>
      </p>
      <form action={action} className="space-y-3">
        <Field label="Spreadsheet (Excel or CSV)"><input type="file" name="csv" accept=".xlsx,.csv" className="text-[13px]" /></Field>
        <Field label="Files for these deals (optional, any number, any format)"><input type="file" name="decks" multiple className="text-[13px]" /></Field>
        <Status s={state} />
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Importing…" : "Import"}</Button>
      </form>
    </Card>
  );
}

export function AddHistoricalForm() {
  const [state, action, pending] = useActionState<TrainState, FormData>(addHistoricalDealAction, { ok: false });
  const [k, setK] = useState(0);
  return (
    <Card>
      <div className="eyebrow mb-1 text-brand-600">Single deal</div>
      <h3 className="mb-4 font-display font-semibold text-[20px] text-navy-900">Add a past decision</h3>
      <form data-unsaved-guard key={k} action={async (fd) => { await action(fd); setK((n) => n + 1); }} className="space-y-3">
        <Field label="Company"><input name="companyName" required className={inputCls} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Decision">
            <select name="decision" className={inputCls} defaultValue="PASSED_AT_SCREENING">
              <option value="INVESTED">Invested</option>
              <option value="PASSED_AFTER_DILIGENCE">Passed after diligence</option>
              <option value="PASSED_AT_SCREENING">Declined at screening</option>
            </select>
          </Field>
          <Field label="Year"><input name="decisionYear" type="number" className={inputCls} /></Field>
          <Field label="Outcome">
            <select name="outcome" className={inputCls} defaultValue="UNKNOWN">
              <option value="UNKNOWN">Unknown</option>
              <option value="ACTIVE">Active</option>
              <option value="ACQUIRED">Acquired</option>
              <option value="IPO">IPO</option>
              <option value="MERGED">Merged</option>
              <option value="WOUND_DOWN">Wound down</option>
            </select>
          </Field>
          <Field label="Sector"><input name="sector" className={inputCls} placeholder="auto if blank" /></Field>
        </div>
        <Field label="Why the partners decided this" hint="Be candid. This is what the analyst learns from.">
          <textarea name="decisionRationale" required rows={3} className={inputCls} />
        </Field>
        <Field label="What happened next"><input name="outcomeNotes" className={inputCls} placeholder="e.g. Raised Series B from X; failed Phase 2 in 2021" /></Field>
        <Field label="Files" hint="The original deck plus anything else: memos, models, data. Any number, any format, any size."><input type="file" name="files" multiple className="text-[13px]" /></Field>
        <Field label="Internal memo text (optional)" hint="Never shown to GAIA during accuracy tests.">
          <textarea name="icMemoText" rows={3} className={inputCls} />
        </Field>
        <Status s={state} />
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Add past deal"}</Button>
      </form>
    </Card>
  );
}

export function ArchiveRowActions({ id, name, failed }: { id: string; name: string; failed: boolean }) {
  const confirm = useConfirm();
  return (
    <div className="flex gap-4 text-[12.5px]">
      {failed && <button onClick={() => retryIngestAction(id)} className="text-navy-700 hover:underline">Try reading again</button>}
      <button
        onClick={async () => {
          if (await confirm({ title: `Remove ${name} from past deals?`, body: "It will no longer be used as a precedent or in accuracy tests. The removal is recorded in the change history.", confirmLabel: "Remove", danger: true }))
            await deleteHistoricalDealAction(id);
        }}
        className="text-neg hover:underline"
      >
        Remove
      </button>
    </div>
  );
}

/** "Add to portfolio" for an invested past deal with no portfolio record. */
export function AddToPortfolioButton({ id }: { id: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="text-[12.5px]">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await addPastDealToPortfolioAction(id);
          setMsg({ ok: r.ok, text: r.message ?? r.error ?? "" });
          setBusy(false);
        }}
        className="font-medium text-navy-700 hover:underline"
      >
        {busy ? "Adding…" : "Add to the portfolio"}
      </button>
      {msg && <span className={cx("ml-2", msg.ok ? "text-pos" : "text-neg")}>{msg.text}</span>}
    </span>
  );
}

/** Attach the original deck so the deal can be replayed in accuracy tests. */
export function AttachDeckForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<TrainState, FormData>(attachDeckAction.bind(null, id), { ok: false });
  const [name, setName] = useState<string | null>(null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <label className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 font-medium text-navy-800 hover:border-navy-700">
        {name ?? "Choose the original deck"}
        <input type="file" name="deck" accept=".pdf,.pptx,.docx,image/*" className="hidden" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
      </label>
      <Button type="submit" disabled={!name || pending} className="!px-3 !py-1.5">{pending ? "Attaching…" : "Attach"}</Button>
      <Status s={state} />
    </form>
  );
}
