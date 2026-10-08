/** The detail recorded for each funding stage, in the order shown and given to GAIA. */
export const STAGE_FIELDS = [
  { key: "role", label: "Genesys's role", placeholder: "e.g. Lead or co-lead", long: false },
  { key: "cheque", label: "Genesys cheque", placeholder: "e.g. C$1M-C$3M", long: false },
  { key: "roundSize", label: "Typical round size", placeholder: "e.g. C$2M-C$6M", long: false },
  { key: "valuation", label: "Typical valuation", placeholder: "e.g. C$6M-C$15M pre-money", long: false },
  { key: "ownership", label: "Ownership target", placeholder: "e.g. 15-25%", long: false },
  { key: "entryEvidence", label: "What must already be true to invest", placeholder: "Data, IP, team and validation a company needs at this stage", long: true },
  { key: "milestones", label: "What the round should achieve", placeholder: "The value inflection this money should reach before the next round", long: true },
  { key: "redFlags", label: "Red flags at this stage", placeholder: "What makes the partners pass at this stage", long: true },
  { key: "notes", label: "Other notes", placeholder: "Typical co-investors, non-dilutive funding, market conditions…", long: true },
] as const;

export const STAGE_SCOPE: Record<string, { label: string; cls: string }> = {
  CORE: { label: "Core focus", cls: "bg-pos-bg text-pos" },
  SELECTIVE: { label: "Selective", cls: "bg-warn-bg text-warn" },
  OUT: { label: "Follow-on only", cls: "bg-[#f1efea] text-muted" },
};

export const STAGE_LABELS: Record<string, string> = {
  name: "Stage",
  scope: "Focus",
  ...Object.fromEntries(STAGE_FIELDS.map((f) => [f.key, f.label])),
};
