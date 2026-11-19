"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { cancelPendingAnalysisAction, confirmAnalysisAction } from "@/lib/deals/actions";

type Line = { label: string; usd: number; note?: string };
const usd = (n: number) => `US$${n.toFixed(2)}`;

/** The projected cost of an analysis, with Run / Don't run. Nothing is spent until Run is pressed. */
export function ConfirmRun(props: {
  analysisId: string;
  version: number;
  usd: number;
  lowUsd: number;
  highUsd: number;
  lines: Line[];
  reused: string[];
  basis: "history" | "defaults";
  remainingUsd: number | null;
  blockedMessage: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const overAllowance = props.remainingUsd != null && props.highUsd > props.remainingUsd;

  const run = () =>
    start(async () => {
      setError(null);
      const r = await confirmAnalysisAction(props.analysisId, props.usd);
      if (!r.ok) setError(r.error ?? "Could not start the analysis.");
      router.refresh();
    });
  const cancel = () =>
    start(async () => {
      if (!window.confirm("Don't run this analysis? Nothing has been spent, and you can run it later.")) return;
      const r = await cancelPendingAnalysisAction(props.analysisId);
      if (!r.ok) setError(r.error ?? "Could not cancel.");
      router.refresh();
    });

  return (
    <div className="mb-8 rounded-lg border border-brand-300 bg-paper px-5 py-5 sm:px-6">
      <div className="eyebrow mb-1 !text-brand-600">Ready to run · version {props.version}</div>
      <h2 className="font-display text-[22px] font-semibold text-navy-900">
        Projected cost: {usd(props.usd)}
      </h2>
      <p className="mt-1 text-[13.5px] text-ink-soft">
        Likely between {usd(props.lowUsd)} and {usd(props.highUsd)}. The analysis starts only when you confirm, and the cost counts against your AI credit.
        {props.remainingUsd != null && <> You have <span className="font-medium text-ink">{usd(props.remainingUsd)}</span> left.</>}
      </p>
      {overAllowance && !props.blockedMessage && (
        <p className="mt-2 text-[13px] text-warn">
          This may cost more than your remaining credit. If the credit runs out part way, the analysis pauses, with nothing lost, until the administrator adds more.
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-[12.5px] font-medium text-navy-800">How this is worked out</summary>
        <table className="mt-3 w-full max-w-xl text-[13px]">
          <tbody className="divide-y divide-line">
            {props.lines.map((l) => (
              <tr key={l.label}>
                <td className="py-1.5 pr-4">{l.label}{l.note && <span className="block text-[12px] text-muted">{l.note}</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{usd(l.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {props.reused.length > 0 && <p className="mt-2 text-[12.5px] text-muted">Reused at no cost: {props.reused.join(", ")}.</p>}
        <p className="mt-1 text-[12.5px] text-muted">
          Based on the size of this deal&apos;s materials and current AI prices{props.basis === "history" ? ", calibrated on the firm's recent analyses" : "; it becomes more accurate as the firm runs more analyses"}. The actual cost is shown on the memo when it finishes.
        </p>
      </details>
      {props.blockedMessage ? (
        <p className="mt-4 text-[13px] text-neg">{props.blockedMessage}</p>
      ) : (
        <label className="mt-4 flex items-start gap-2 text-[13.5px] text-ink">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
          <span>I understand this analysis is projected to cost about {usd(props.usd)} (up to {usd(props.highUsd)}).</span>
        </label>
      )}
      {error && <p className="mt-3 text-[13px] text-neg">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={run} disabled={pending || !agreed || !!props.blockedMessage}>{pending ? "Starting…" : `Run analysis (about ${usd(props.usd)})`}</Button>
        <Button variant="secondary" onClick={cancel} disabled={pending}>Don&apos;t run</Button>
      </div>
    </div>
  );
}
