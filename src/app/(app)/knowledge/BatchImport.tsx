"use client";

import { useActionState, useState } from "react";
import { importTableAction, type UploadState } from "@/lib/knowledge/actions";
import { Button, cx } from "@/components/ui";

/** One row per import: download the template (Excel or CSV), fill it in, upload it. */
export function BatchImport() {
  return (
    <div className="divide-y divide-line">
      <ImportRow kind="portfolio" title="Portfolio companies" help="One row per company. Existing companies are updated, not duplicated." />
      <ImportRow kind="principles" title="Investment principles" help="One row per rule or preference." />
      <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-navy-900">Past deals</div>
          <div className="text-[12.5px] text-muted">Invested or passed, with the reasoning and optionally the original decks. Imported in the Training Studio.</div>
        </div>
        <div className="flex items-center gap-3 text-[12.5px]">
          <TemplateLinks name="past-deals" />
          <a href="/training/archive" className="rounded-lg border border-line-strong px-3 py-1.5 font-medium text-navy-800 hover:border-navy-700">Import past deals →</a>
        </div>
      </div>
    </div>
  );
}

function TemplateLinks({ name }: { name: string }) {
  return (
    <span className="text-muted">
      Template:{" "}
      <a href={`/api/templates/${name}?format=xlsx`} className="font-medium text-navy-700 hover:underline">Excel</a>
      {" · "}
      <a href={`/api/templates/${name}?format=csv`} className="font-medium text-navy-700 hover:underline">CSV</a>
    </span>
  );
}

function ImportRow({ kind, title, help }: { kind: "portfolio" | "principles"; title: string; help: string }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(importTableAction.bind(null, kind), { ok: false });
  const [file, setFile] = useState<string | null>(null);
  return (
    <form action={action} className="py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-navy-900">{title}</div>
          <div className="text-[12.5px] text-muted">{help}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <TemplateLinks name={kind} />
          <label className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 font-medium text-navy-800 hover:border-navy-700">
            {file ? file : "Choose filled-in file"}
            <input type="file" name="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)} />
          </label>
          <Button type="submit" disabled={!file || pending} className="!px-3 !py-1.5">{pending ? "Importing…" : "Import"}</Button>
        </div>
      </div>
      {(state.message || state.error) && <p className={cx("mt-2 text-[12.5px]", state.error ? "text-neg" : "text-pos")}>{state.error ?? state.message}</p>}
    </form>
  );
}
