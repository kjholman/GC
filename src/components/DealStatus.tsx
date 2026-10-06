import type { DealStatus } from "@prisma/client";
import { StatusBadge } from "./ui";

/**
 * What a deal's status pill should say. A deal whose only analyses failed or were
 * stopped isn't really "Screening", so it says so; once a memo exists the deal
 * keeps the stage from its last finished analysis.
 */
export function DealStatusBadge({ status, latestAnalysis, finishedCount }: { status: DealStatus; latestAnalysis?: string | null; finishedCount: number }) {
  if (latestAnalysis === "PAUSED") return <Pill tone="warn">Paused: out of credit</Pill>;
  if (finishedCount === 0 && latestAnalysis === "STOPPED") return <Pill tone="warn">Paused</Pill>;
  if (finishedCount === 0 && latestAnalysis === "FAILED") return <Pill tone="neg">Didn&apos;t finish</Pill>;
  return <StatusBadge status={status} />;
}

function Pill({ tone, children }: { tone: "warn" | "neg"; children: React.ReactNode }) {
  const cls = tone === "warn" ? "border-[#efdcb4] bg-warn-bg text-warn" : "border-[#efd2ce] bg-neg-bg text-neg";
  const dot = tone === "warn" ? "bg-warn" : "bg-neg";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
