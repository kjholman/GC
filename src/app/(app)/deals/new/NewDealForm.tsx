"use client";

import { useActionState } from "react";
import { createDealAction, type ActionState } from "@/lib/deals/actions";
import { Dropzone } from "@/components/Dropzone";
import { Button, Card, Field, inputCls } from "@/components/ui";

const STEPS = [
  ["Read", "Every slide, figure and table in the materials"],
  ["Research", "Live search of literature, trials, competitors and comparable deals"],
  ["Benchmark", "Against Genesys Capital's portfolio history and recent decisions"],
  ["Decide", "Decline, request information, or advance to diligence, with a founder email"],
];

export function NewDealForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createDealAction, { ok: false });
  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <div className="eyebrow mb-4">Materials</div>
          <Dropzone prompt="Drop the pitch deck here" />
        </Card>
        <Card>
          <div className="eyebrow mb-5">Deal details <span className="normal-case tracking-normal font-normal">(optional; the analyst extracts these from the deck)</span></div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Company name">
              <input name="companyName" className={inputCls} placeholder="e.g. Northbridge Therapeutics" />
            </Field>
            <Field label="Source">
              <input name="source" className={inputCls} placeholder="e.g. Inbound, MaRS, co-investor referral" />
            </Field>
            <Field label="Founder contact">
              <input name="contactName" className={inputCls} placeholder="Full name" />
            </Field>
            <Field label="Founder email">
              <input name="contactEmail" type="email" className={inputCls} placeholder="founder@company.com" />
            </Field>
          </div>
          <div className="mt-5">
            <Field label="Context for the analyst" hint="Anything not in the deck: how it came in, prior conversations, a partner's specific question.">
              <textarea name="analystContext" rows={4} className={inputCls} />
            </Field>
          </div>
        </Card>
      </div>

      <div>
        <div className="sticky top-10 space-y-5">
          <Card className="!bg-navy-950 !border-navy-950 text-white">
            <div className="eyebrow mb-5 !text-gold-300">What happens next</div>
            <ol className="space-y-5">
              {STEPS.map(([t, d], i) => (
                <li key={t} className="flex gap-4">
                  <span className="font-serif text-[18px] text-gold-300 tabular">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="text-[14px] font-medium">{t}</div>
                    <div className="mt-0.5 text-[12.5px] leading-relaxed text-white/60">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
          {state.error && <p className="rounded-[3px] border border-[#efd2ce] bg-neg-bg px-4 py-3 text-[13px] text-neg">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full py-3.5">
            {pending ? "Uploading materials…" : "Begin analysis"}
          </Button>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Materials are stored in Genesys&apos; private database and sent to the model provider only for analysis, under
            commercial terms that exclude training on your data.
          </p>
        </div>
      </div>
    </form>
  );
}
