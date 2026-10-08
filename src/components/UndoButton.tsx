"use client";

import { useState } from "react";
import { undoChangeAction } from "@/lib/knowledge/actions";
import { useConfirm } from "./Confirm";
import { cx } from "./ui";

/** Undo one recorded change, after a confirmation pop-up. */
export function UndoButton({ auditId, what }: { auditId: string; what: string }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  if (res?.ok) return <span className="text-[12px] text-pos">Undone</span>;
  return (
    <span className="text-[12px]">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!(await confirm({ title: "Undo this change?", body: `${what}. The record goes back to how it was before, and the undo is itself recorded.`, confirmLabel: "Undo" }))) return;
          setBusy(true);
          const r = await undoChangeAction(auditId);
          setRes({ ok: r.ok, text: r.message ?? r.error ?? "" });
          setBusy(false);
        }}
        className="font-medium text-navy-700 hover:underline"
      >
        {busy ? "Undoing…" : "Undo"}
      </button>
      {res && !res.ok && <span className={cx("ml-2 text-neg")}>{res.text}</span>}
    </span>
  );
}
