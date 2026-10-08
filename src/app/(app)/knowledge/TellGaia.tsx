"use client";

import { useActionState, useState } from "react";
import { noteToKnowledgeAction, type UploadState } from "@/lib/knowledge/actions";
import { Button, cx, inputCls } from "@/components/ui";

/** Anyone on the team can add knowledge by writing (or pasting) it in plain English. */
export function TellGaia() {
  const [state, action, pending] = useActionState<UploadState, FormData>(noteToKnowledgeAction, { ok: false });
  const [k, setK] = useState(0);
  return (
    <form data-unsaved-guard key={k} action={async (fd) => { await action(fd); setK((n) => n + 1); }} className="space-y-3">
      <textarea
        name="note"
        rows={3}
        className={inputCls}
        placeholder={"e.g. We put another C$1M into Novalith in March at a C$40M pre-money; Lumira led. Or paste an email or board-meeting notes."}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>{pending ? "Reading…" : "Tell GAIA"}</Button>
        <span className="text-[12px] text-muted">GAIA turns it into suggestions to review; nothing changes until someone accepts.</span>
      </div>
      {(state.message || state.error) && <p className={cx("text-[13px]", state.error ? "text-neg" : "text-pos")}>{state.error ?? state.message}</p>}
    </form>
  );
}
