"use client";

import { useActionState } from "react";
import { startBacktestAction, type TrainState } from "@/lib/training/actions";
import { Button, Field, inputCls } from "@/components/ui";

export function StartBacktestForm({ eligible }: { eligible: number }) {
  const [state, action, pending] = useActionState<TrainState, FormData>(startBacktestAction, { ok: false });
  return (
    <form action={action} className="space-y-4">
      <Field label="Label"><input name="label" placeholder="e.g. After adding device principles" className={inputCls} /></Field>
      <Field label="Deals to replay" hint={`${eligible} archived deals have decks. The sample is balanced across invested, passed-after-diligence and declined. Roughly US$1–2 per deal.`}>
        <input name="limit" type="number" min={1} max={200} defaultValue={Math.min(25, eligible || 25)} className={inputCls} />
      </Field>
      {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
      <Button type="submit" disabled={pending || !eligible} className="w-full">{pending ? "Starting…" : "Start backtest"}</Button>
    </form>
  );
}
