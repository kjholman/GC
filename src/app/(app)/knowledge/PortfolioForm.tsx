"use client";

import { useActionState, useEffect, useState } from "react";
import type { PortfolioCompany } from "@prisma/client";
import { deletePortfolioCompanyAction, savePortfolioCompanyAction, type AdminState } from "@/lib/admin/actions";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { useConfirm, useConfirmSubmit } from "@/components/Confirm";

export function PortfolioForm({ company, onSaved }: { company: PortfolioCompany | null; onSaved?: () => void }) {
  const [state, action, pending] = useActionState<AdminState, FormData>(
    savePortfolioCompanyAction.bind(null, company?.id ?? null),
    { ok: false },
  );
  useEffect(() => {
    if (state.ok) onSaved?.();
  }, [state, onSaved]);
  const confirmSave = useConfirmSubmit(
    company
      ? { title: `Save changes to ${company.name}?`, body: "Every future analysis will use the updated details. The change is recorded in the change history.", confirmLabel: "Save changes" }
      : null,
  );
  return (
    <Card>
      <div className="eyebrow mb-1 text-brand-600">{company ? "Edit record" : "Add to record"}</div>
      <h3 className="mb-5 font-display font-semibold text-[20px] text-navy-900">{company ? company.name : "Portfolio company"}</h3>
      <form
        action={action}
        onSubmit={confirmSave}
        className="space-y-4"
      >
        <Field label="Company"><input name="name" required defaultValue={company?.name} className={inputCls} /></Field>
        <Field label="Website" hint="Lets GAIA recognise this company when it pitches again, and look it up online.">
          <input name="website" defaultValue={company?.website ?? ""} placeholder="e.g. company.com" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sector"><input name="sector" required defaultValue={company?.sector} placeholder="Therapeutics" className={inputCls} /></Field>
          <Field label="Modality"><input name="modality" defaultValue={company?.modality ?? ""} className={inputCls} /></Field>
          <Field label="Indication"><input name="indication" defaultValue={company?.indication ?? ""} className={inputCls} /></Field>
          <Field label="Year invested"><input name="yearInvested" type="number" defaultValue={company?.yearInvested ?? ""} className={inputCls} /></Field>
          <Field label="Entry stage"><input name="stageAtEntry" defaultValue={company?.stageAtEntry ?? ""} className={inputCls} /></Field>
          <Field label="Outcome">
            <select name="outcome" defaultValue={company?.outcome ?? "ACTIVE"} className={inputCls}>
              <option value="ACTIVE">Active</option>
              <option value="ACQUIRED">Acquired</option>
              <option value="IPO">IPO</option>
              <option value="MERGED">Merged</option>
              <option value="WOUND_DOWN">Wound down</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
          </Field>
        </div>
        <div>
          <div className="mb-2 text-[12.5px] font-medium text-ink-soft">Financials <span className="font-normal text-muted">(optional, write them however is natural)</span></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Genesys investment"><input name="checkSize" defaultValue={company?.checkSize ?? ""} placeholder="e.g. $3M across Series A and B" className={inputCls} /></Field>
            <Field label="Round size at entry"><input name="roundSize" defaultValue={company?.roundSize ?? ""} placeholder="e.g. $12M Series A" className={inputCls} /></Field>
            <Field label="Valuation at entry"><input name="entryValuation" defaultValue={company?.entryValuation ?? ""} placeholder="e.g. $25M pre-money" className={inputCls} /></Field>
            <Field label="Ownership"><input name="ownership" defaultValue={company?.ownership ?? ""} placeholder="e.g. 14% fully diluted" className={inputCls} /></Field>
            <Field label="Co-investors"><input name="coInvestors" defaultValue={company?.coInvestors ?? ""} placeholder="e.g. Lumira, BDC" className={inputCls} /></Field>
            <Field label="Exit or current value"><input name="exitValue" defaultValue={company?.exitValue ?? ""} placeholder="e.g. acquired for $310M" className={inputCls} /></Field>
            <Field label="Return"><input name="returnMultiple" defaultValue={company?.returnMultiple ?? ""} placeholder="e.g. 4.2x gross, 38% IRR" className={inputCls} /></Field>
          </div>
        </div>
        <Field label="Description"><textarea name="description" required rows={3} defaultValue={company?.description} className={inputCls} /></Field>
        <Field label="Outcome detail"><textarea name="outcomeNotes" rows={2} defaultValue={company?.outcomeNotes ?? ""} className={inputCls} /></Field>
        <Field label="Lessons learned" hint="What the partnership would do the same or differently. The analyst cites these directly.">
          <textarea name="lessons" rows={3} defaultValue={company?.lessons ?? ""} className={inputCls} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-ink-soft">
          <input type="checkbox" name="verified" defaultChecked={company?.verified ?? false} className="accent-navy-900" />
          Verified by the partnership
        </label>
        {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
        {state.message && <p className="text-[13px] text-pos">{state.message}</p>}
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save"}</Button>
      </form>
    </Card>
  );
}

export function DeleteCompanyButton({ id, name }: { id: string; name: string }) {
  const confirm = useConfirm();
  return (
    <button
      className="text-neg hover:underline"
      onClick={async () => {
        if (await confirm({ title: `Remove ${name}?`, body: "It will no longer be used as a benchmark in analyses. The removal is recorded in the change history.", confirmLabel: "Remove", danger: true }))
          await deletePortfolioCompanyAction(id);
      }}
    >
      Remove
    </button>
  );
}

export function EditCompanyDialog({ company }: { company: PortfolioCompany }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="text-navy-700 hover:underline" onClick={() => setOpen(true)}>Edit</button>
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-navy-950/40 p-10"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-lg">
            <PortfolioForm company={company} onSaved={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
