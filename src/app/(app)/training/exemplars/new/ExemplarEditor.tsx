"use client";

import { useActionState } from "react";
import { SCORE_DIMENSIONS, type Memo } from "@/lib/ai/schema";
import { saveExemplarAction, type TrainState } from "@/lib/training/actions";
import { Button, Card, Field, inputCls } from "@/components/ui";
import { useConfirmSubmit } from "@/components/Confirm";

export function ExemplarEditor({ analysisId, companyName, version, memo }: { analysisId: string; companyName: string; version: number; memo: Memo }) {
  const [state, action, pending] = useActionState<TrainState, FormData>(saveExemplarAction.bind(null, analysisId), { ok: false });
  const confirmSave = useConfirmSubmit({
    title: "Save this as an example memo?",
    body: "GAIA will study it whenever it sees a similar deal.",
    confirmLabel: "Save example",
  });
  return (
    <form data-unsaved-guard action={action} onSubmit={confirmSave} className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Card>
          <div className="eyebrow mb-1 text-brand-600">Correcting memo v{version}</div>
          <h2 className="mb-5 font-display font-semibold text-[24px] text-navy-900">{companyName}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Name for this example"><input name="title" defaultValue={companyName} className={inputCls} /></Field>
            <Field label="Correct decision">
              <select name="recommendation" defaultValue={memo.recommendation} className={inputCls}>
                <option value="REJECT">Decline</option>
                <option value="PENDING_INFO">Request information</option>
                <option value="ADVANCE_TO_DILIGENCE">Advance to diligence</option>
              </select>
            </Field>
            <Field label="Correct overall score"><input name="overallScore" type="number" min={0} max={100} defaultValue={memo.overallScore} className={inputCls} /></Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Verdict headline"><input name="headline" defaultValue={memo.worthOurTime.headline} className={inputCls} /></Field>
            <Field label="Verdict rationale"><textarea name="rationale" rows={6} defaultValue={memo.worthOurTime.rationale} className={inputCls} /></Field>
            <Field label="Executive summary"><textarea name="executiveSummary" rows={7} defaultValue={memo.executiveSummary} className={inputCls} /></Field>
          </div>
        </Card>
        <Card>
          <div className="eyebrow mb-4">Scorecard</div>
          <div className="space-y-4">
            {memo.scorecard.map((s) => (
              <div key={s.dimension} className="grid grid-cols-1 gap-3 md:grid-cols-[200px_80px_1fr]">
                <div className="pt-2.5 text-[13.5px] font-medium text-navy-900">{s.dimension}</div>
                <input name={`score_${SCORE_DIMENSIONS.indexOf(s.dimension)}`} type="number" min={1} max={10} defaultValue={s.score} className={inputCls} aria-label={`${s.dimension} score`} />
                <textarea name={`assessment_${SCORE_DIMENSIONS.indexOf(s.dimension)}`} rows={2} defaultValue={s.assessment} className={inputCls} aria-label={`${s.dimension} assessment`} />
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div>
        <div className="sticky top-10 space-y-5">
          <Card className="!border-brand-300">
            <div className="eyebrow mb-1 text-brand-600">Required</div>
            <h3 className="mb-3 font-display font-semibold text-[19px] text-navy-900">Partner commentary</h3>
            <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
              What makes this the right analysis, and what did GAIA get wrong? It reads this whenever it sees a similar deal.
            </p>
            <textarea name="partnerCommentary" rows={7} className={inputCls} placeholder="e.g. The AI underweighted the human genetic validation; for peripherally restricted mechanisms we accept single-species tox at seed if…" />
          </Card>
          {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full py-3">{pending ? "Saving…" : "Save as example memo"}</Button>
          <p className="text-[11.5px] leading-relaxed text-muted">
            If you change the decision or move the score by 10 points or more, this also counts as partner feedback.
          </p>
        </div>
      </div>
    </form>
  );
}
