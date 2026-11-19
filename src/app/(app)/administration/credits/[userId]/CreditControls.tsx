"use client";

import { useActionState } from "react";
import { Button, Card, Field, inputCls } from "@/components/ui";
import {
  addCreditAction,
  cutOffAction,
  refillAction,
  removeLimitAction,
  restoreAction,
  setAllowanceAction,
  type CreditState,
} from "@/lib/credits/actions";

type Act = (userId: string, s: CreditState, fd: FormData) => Promise<CreditState>;

function Result({ state }: { state: CreditState }) {
  if (state.error) return <p className="text-[13px] text-neg">{state.error}</p>;
  if (state.message) return <p className="text-[13px] text-pos">{state.message}</p>;
  return null;
}

function AmountForm({ userId, act, title, hint, button, placeholder }: { userId: string; act: Act; title: string; hint: string; button: string; placeholder: string }) {
  const [state, action, pending] = useActionState<CreditState, FormData>(act.bind(null, userId), { ok: false });
  return (
    <form action={action} className="space-y-3">
      <div className="font-display text-[16px] font-semibold text-navy-900">{title}</div>
      <Field label="Amount (US$)" hint={hint}>
        <input name="amount" inputMode="decimal" placeholder={placeholder} className={inputCls} required />
      </Field>
      <Field label="Note (optional)">
        <input name="note" maxLength={500} placeholder="For example: Q1 diligence work" className={inputCls} />
      </Field>
      <Result state={state} />
      <Button type="submit" disabled={pending} className="w-full">{button}</Button>
    </form>
  );
}

function OneClick({ userId, act, label, variant = "secondary", confirm }: { userId: string; act: Act; label: string; variant?: "secondary" | "danger"; confirm?: string }) {
  const [state, action, pending] = useActionState<CreditState, FormData>(act.bind(null, userId), { ok: false });
  return (
    <form action={action} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }} className="space-y-2">
      <Button type="submit" variant={variant} disabled={pending} className="w-full">{label}</Button>
      <Result state={state} />
    </form>
  );
}

export function CreditControls({ userId, name, hasLimit, cutOff, limitUsd }: { userId: string; name: string; hasLimit: boolean; cutOff: boolean; limitUsd: number | null }) {
  return (
    <Card>
      <div className="eyebrow mb-1 !text-brand-600">Manage</div>
      <h3 className="mb-5 font-display text-[20px] font-semibold text-navy-900">{name}&apos;s AI credit</h3>
      <div className="space-y-7">
        {hasLimit && (
          <AmountForm userId={userId} act={addCreditAction} title="Add credit" button="Add credit" placeholder="25"
            hint="Raises the allowance by this amount; what they have used stays counted." />
        )}
        <AmountForm userId={userId} act={setAllowanceAction} title={hasLimit ? "Change the allowance" : "Set an allowance"} button={hasLimit ? "Change allowance" : "Set allowance"}
          placeholder={limitUsd != null ? String(limitUsd) : "50"}
          hint={hasLimit ? "The new total they can spend. What they have used so far still counts against it." : "The most they can spend on AI from now on. Spending starts counting today."} />
        <div className="space-y-3 border-t border-line pt-5">
          {hasLimit && (
            <OneClick userId={userId} act={refillAction} label={`Refill to the full ${limitUsd != null ? `US$${limitUsd.toFixed(2)}` : "allowance"}`}
              confirm={`Reset what ${name} has used to zero, so the full allowance is available again?`} />
          )}
          {cutOff ? (
            <OneClick userId={userId} act={restoreAction} label="Switch AI work back on" />
          ) : (
            <OneClick userId={userId} act={cutOffAction} label="Switch off AI work" variant="danger"
              confirm={`Switch off AI work for ${name}? They keep access to GAIA, but can't start analyses or other AI tasks, and anything running pauses.`} />
          )}
          {hasLimit && (
            <OneClick userId={userId} act={removeLimitAction} label="Take off the limit"
              confirm={`Take off ${name}'s allowance? Their AI use will no longer be limited.`} />
          )}
        </div>
      </div>
    </Card>
  );
}
