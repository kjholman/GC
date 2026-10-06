"use client";

import { useState } from "react";
import { checkCreditAction } from "@/lib/admin/actions";
import { Button, Card, SectionTitle, cx } from "@/components/ui";

export function CreditPanel({
  lowSince, lastOk, lastChecked, monthUsd, allTimeUsd, analysesThisMonth, perAnalysisUsd, byPurpose, models, paused, billingUrl,
}: {
  lowSince: string | null; lastOk: string | null; lastChecked: string | null;
  monthUsd: number; allTimeUsd: number; analysesThisMonth: number; perAnalysisUsd: number | null;
  byPurpose: { purpose: string; usd: number }[]; models: { main: string; fast: string; effort: string };
  paused: number; billingUrl: string;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string }>();
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" }) : "never");
  const usd = (n: number) => `US$${n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString("en-CA")}`;
  const out = !!lowSince;
  return (
    <Card>
      <SectionTitle eyebrow="AI service" title="Anthropic credit" />
      <div className={cx("rounded-lg border px-4 py-3", out ? "border-[#efd2ce] bg-neg-bg" : "border-[#c9e2d9] bg-pos-bg")}>
        <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
          <span className={cx("h-2.5 w-2.5 rounded-full", out ? "bg-neg" : "bg-pos")} />
          {out ? "Out of credit" : "Credit available"}
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
          {out
            ? `Anthropic has refused requests for lack of credit since ${when(lowSince)}. New analyses pause until credit is added.`
            : `Last successful AI request: ${when(lastOk)}.`}
          {paused > 0 && ` ${paused} analys${paused === 1 ? "is is" : "es are"} paused and will resume after a successful check.`}
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-[12.5px]">
        <div>
          <dt className="text-muted">Spent this month</dt>
          <dd className="mt-0.5 text-[18px] font-semibold text-navy-900 tabular">{usd(monthUsd)}</dd>
          <dd className="text-muted">{analysesThisMonth} analys{analysesThisMonth === 1 ? "is" : "es"} finished</dd>
        </div>
        <div>
          <dt className="text-muted">Average per analysis</dt>
          <dd className="mt-0.5 text-[18px] font-semibold text-navy-900 tabular">{perAnalysisUsd != null ? usd(perAnalysisUsd) : "n/a"}</dd>
          <dd className="text-muted">{usd(allTimeUsd)} in total</dd>
        </div>
      </dl>
      {byPurpose.length > 0 && (
        <ul className="mt-3 space-y-1 text-[12px]">
          {byPurpose.map((p) => (
            <li key={p.purpose} className="flex justify-between gap-3">
              <span className="text-ink-soft first-letter:uppercase">{p.purpose}</span>
              <span className="tabular text-muted">{usd(p.usd)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
        Measured from every AI request, web searches included. Models: {models.main} for memos and fact-checks, {models.fast} for reading and
        research; memo effort {models.effort}. Anthropic doesn&apos;t let apps read the exact remaining balance; see it, add credit or turn on
        auto-reload on the{" "}
        <a href={billingUrl} target="_blank" rel="noreferrer" className="text-navy-700 underline">Anthropic billing page</a>.
      </p>
      <Button
        className="mt-4 w-full"
        variant={out ? "primary" : "secondary"}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setResult(await checkCreditAction());
          setPending(false);
        }}
      >
        {pending ? "Checking…" : out ? "I've added credit: check again" : "Check credit now"}
      </Button>
      {result && <p className={cx("mt-2 text-[12.5px]", result.ok ? "text-pos" : "text-neg")}>{result.message}</p>}
      <p className="mt-2 text-[11.5px] text-muted">Last checked: {when(lastChecked)}</p>
    </Card>
  );
}
