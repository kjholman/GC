"use client";

import { createContext, useContext, type ReactNode } from "react";

type Ev = { id: string; claim: string; sourceType: string; sourceRef: string; status: string; flagged: boolean };
const Ctx = createContext<Record<string, Ev>>({});

export function EvidenceProvider({ evidence, children }: { evidence: Ev[]; children: ReactNode }) {
  return <Ctx.Provider value={Object.fromEntries(evidence.map((e) => [e.id, e]))}>{children}</Ctx.Provider>;
}

const STATUS_CLS: Record<string, string> = {
  VERIFIED_IN_SOURCE: "border-pos/40 text-pos",
  COMPANY_CLAIM: "border-warn/40 text-warn",
  INFERENCE: "border-navy-700/30 text-navy-700",
  NEEDS_VERIFICATION: "border-neg/40 text-neg",
};

/** Inline citation chip: hover shows the claim, its source and verification status. */
export function EvidenceTag({ id }: { id: string }) {
  const e = useContext(Ctx)[id];
  if (!e) return <sup className="ml-0.5 text-[9px] text-neg" title="This source reference could not be found">[{id}?]</sup>;
  return (
    <sup
      className={`ml-0.5 cursor-help rounded-md border px-1 py-px font-sans text-[9px] font-semibold tracking-wide ${e.flagged ? "border-neg bg-neg-bg text-neg" : STATUS_CLS[e.status]}`}
      title={`${e.claim}\n\nSource: ${e.sourceRef}${e.flagged ? "\n⚠ The fact-check flagged this" : ""}`}
    >
      {id}
    </sup>
  );
}
