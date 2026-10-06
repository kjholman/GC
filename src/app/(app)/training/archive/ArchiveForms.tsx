"use client";

import { useActionState, useState } from "react";
import {
  addHistoricalDealAction,
  deleteHistoricalDealAction,
  importArchiveCsvAction,
  retryIngestAction,
  type TrainState,
} from "@/lib/training/actions";
import { Button, Card, Field, cx, inputCls } from "@/components/ui";

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
        Upload a spreadsheet (saved as CSV) with one row per deal, plus the original decks. Each deck is matched to its row by the file name you put in the “deck_filename” column.{" "}
        <a href="/templates/deal-archive-template.csv" className="text-navy-700 underline">Download the template</a>
      </p>
      <form action={action} className="space-y-3">
        <Field label="Spreadsheet (CSV)"><input type="file" name="csv" accept=".csv" className="text-[13px]" /></Field>
        <Field label="Original decks (optional, multiple)"><input type="file" name="decks" multiple accept=".pdf,.pptx,.docx" className="text-[13px]" /></Field>
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
      <form key={k} action={async (fd) => { await action(fd); setK((n) => n + 1); }} className="space-y-3">
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
        <Field label="Original deck"><input type="file" name="deck" accept=".pdf,.pptx,.docx,.png,.jpg" className="text-[13px]" /></Field>
        <Field label="Internal memo text (optional)" hint="Never shown to the Sharminator during accuracy tests.">
          <textarea name="icMemoText" rows={3} className={inputCls} />
        </Field>
        <Status s={state} />
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Add past deal"}</Button>
      </form>
    </Card>
  );
}

export function ArchiveRowActions({ id, name, failed }: { id: string; name: string; failed: boolean }) {
  return (
    <div className="flex gap-4 text-[12.5px]">
      {failed && <button onClick={() => retryIngestAction(id)} className="text-navy-700 hover:underline">Try reading again</button>}
      <button
        onClick={async () => { if (confirm(`Remove ${name} from past deals?`)) await deleteHistoricalDealAction(id); }}
        className="text-neg hover:underline"
      >
        Remove
      </button>
    </div>
  );
}
