"use client";

import { useActionState } from "react";
import { startBacktestAction, type TrainState } from "@/lib/training/actions";
import { Button, Field, inputCls } from "@/components/ui";

export function StartBacktestForm({ eligible }: { eligible: number }) {
  const [state, action, pending] = useActionState<TrainState, FormData>(startBacktestAction, { ok: false });
  return (
    <form action={action} className="space-y-4">
      <Field label="Name"><input name="label" placeholder="e.g. After adding device principles" className={inputCls} /></Field>
      <Field label="How many past deals to re-screen" hint={`${eligible} past deals have their original decks. The mix is balanced across invested, passed after diligence, and declined. Costs roughly US$1 to US$2 per deal.`}>
        <input name="limit" type="number" min={1} max={200} defaultValue={Math.min(25, eligible || 25)} className={inputCls} />
      </Field>
      {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
      <Button type="submit" disabled={pending || !eligible} className="w-full">{pending ? "Starting…" : "Start test"}</Button>
    </form>
  );
}
