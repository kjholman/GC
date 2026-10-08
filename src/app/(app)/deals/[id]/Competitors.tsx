import type { CompetitorSweep, Memo } from "@/lib/ai/schema";
import { Card, SectionTitle, cx } from "@/components/ui";
import { Paras } from "./Memo";
import { Paged, PagedTable } from "@/components/Pager";

const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Active", cls: "bg-navy-50 text-navy-700" },
  ACQUIRED: { label: "Acquired", cls: "bg-pos-bg text-pos" },
  IPO: { label: "IPO", cls: "bg-pos-bg text-pos" },
  PARTNERED: { label: "Partnered", cls: "bg-info-bg text-info" },
  FAILED: { label: "Failed", cls: "bg-neg-bg text-neg" },
  SHUT_DOWN: { label: "Shut down", cls: "bg-neg-bg text-neg" },
  PIVOTED: { label: "Pivoted", cls: "bg-warn-bg text-warn" },
  UNKNOWN: { label: "Unknown", cls: "bg-[#f1efea] text-muted" },
};
const REL: Record<string, string> = { DIRECT: "Direct", ADJACENT: "Adjacent", PRECEDENT: "Precedent" };

const money = (m: number | null) => (m == null ? "Not disclosed" : m >= 1000 ? `US$${(m / 1000).toFixed(1)}B` : `US$${Math.round(m)}M`);
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export function CompetitorsView({ sweep, memo }: { sweep: CompetitorSweep | null; memo: Memo }) {
  if (!sweep) {
    return (
      <Card>
        <p className="text-[14px] text-muted">
          No competitive sweep was run for this version, either because web research is turned off or because the search failed. Re-run the analysis to perform one.
        </p>
      </Card>
    );
  }
  const cs = sweep.competitors;
  const order = ["DIRECT", "ADJACENT", "PRECEDENT"];
  const sorted = [...cs].sort((a, b) => order.indexOf(a.relationship) - order.indexOf(b.relationship) || (b.totalFundingUsdM ?? 0) - (a.totalFundingUsdM ?? 0));
  const disclosed = cs.reduce((a, c) => a + (c.totalFundingUsdM ?? 0), 0);
  const exits = cs.filter((c) => ["ACQUIRED", "IPO", "PARTNERED"].includes(c.status)).length;
  const failures = cs.filter((c) => ["FAILED", "SHUT_DOWN"].includes(c.status)).length;
  const genesysLike = cs.filter((c) => c.genesysLikeInvestors).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
        {[
          ["Companies tracked", cs.length, `${cs.filter((c) => c.relationship === "DIRECT").length} direct · ${cs.filter((c) => c.relationship === "ADJACENT").length} adjacent · ${cs.filter((c) => c.relationship === "PRECEDENT").length} precedent`],
          ["Disclosed funding", disclosed ? money(disclosed) : "n/a", "Across tracked companies"],
          ["Outcomes", `${exits} / ${failures}`, "Exits or partnerships / failures"],
          ["Genesys-like backers", genesysLike, "Companies backed by comparable investors"],
        ].map(([k, v, n]) => (
          <div key={k as string} className="bg-paper px-6 py-5">
            <div className="eyebrow">{k}</div>
            <div className="mt-2 font-display font-semibold text-[30px] leading-none tabular text-navy-900">{v}</div>
            <div className="mt-2 text-[12px] text-muted">{n}</div>
          </div>
        ))}
      </div>

      {memo.market.comparableOutcomes && (
        <Card className="!border-l-4 !border-l-brand-500">
          <div className="eyebrow mb-2 text-brand-600">What the comparables imply for this deal</div>
          <Paras text={memo.market.comparableOutcomes} />
        </Card>
      )}

      <Card>
        <SectionTitle eyebrow="Field summary" title="How this space has played out" />
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
          {[
            ["Crowding", sweep.fieldSummary.crowding],
            ["Capital raised in the field", sweep.fieldSummary.capitalRaisedInField],
            ["What separated winners", sweep.fieldSummary.whatSeparatedWinners],
            ["How value was realised", sweep.fieldSummary.exitPattern],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="eyebrow mb-1">{k}</div>
              <p className="text-[13.5px] leading-relaxed text-ink-soft">{v}</p>
            </div>
          ))}
          <div className="md:col-span-2">
            <div className="eyebrow mb-1">Implications for Genesys</div>
            <p className="text-[14px] leading-relaxed text-ink">{sweep.fieldSummary.implicationsForGenesys}</p>
          </div>
        </div>
      </Card>

      <Card pad={false}>
        <div className="px-6 pt-6"><SectionTitle eyebrow="Competitor sweep" title="Companies doing the same thing" /></div>
        <Paged as="ul" pageSize={10} className="divide-y divide-line border-t border-line" pagerClassName="border-t border-line px-5">
          {sorted.map((c) => {
            const leads = [...new Set(c.fundingRounds.flatMap((r) => r.leadInvestors))];
            return (
              <li key={c.name} className="px-6 py-4">
                <details className="group">
                  <summary className="grid grid-cols-1 cursor-pointer list-none gap-3 md:grid-cols-[minmax(0,1fr)_96px_104px_170px_16px] md:items-center">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-navy-900">{c.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                        <span className="rounded-full border border-line-strong px-2 py-px text-[10.5px]">{REL[c.relationship]}</span>
                        {c.genesysLikeInvestors && <span className="whitespace-nowrap rounded-full bg-brand-100 px-2 py-px text-[10.5px] text-brand-600">Genesys-like backers</span>}
                        <span className="truncate">{[c.headquarters, c.stage].filter(Boolean).join(" · ")}</span>
                      </div>
                    </div>
                    <span className={cx("w-fit rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]", STATUS[c.status].cls)}>{STATUS[c.status].label}</span>
                    <span className="font-display font-semibold text-[16px] tabular text-navy-900">{money(c.totalFundingUsdM)}</span>
                    <span className="truncate text-[12.5px] text-ink-soft">{leads.length ? leads.slice(0, 3).join(", ") : "Investors not found"}</span>
                    <span className="text-muted transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="mt-4 grid grid-cols-1 gap-5 border-t border-line pt-4 text-[13px] md:grid-cols-2">
                    <div className="space-y-3">
                      <div><div className="eyebrow mb-1">Approach</div><p className="text-ink-soft">{c.approach}</p></div>
                      <div><div className="eyebrow mb-1">Outcome</div><p className="text-ink-soft">{c.outcome}</p></div>
                      <div><div className="eyebrow mb-1">Investor profile</div><p className="text-ink-soft">{c.investorProfile}</p></div>
                      <div className="border-l-2 border-brand-500 pl-3"><div className="eyebrow mb-1">Lesson for this deal</div><p className="text-ink">{c.lessonForThisDeal}</p></div>
                    </div>
                    <div>
                      <div className="eyebrow mb-2">Funding history</div>
                      {c.fundingRounds.length === 0 ? (
                        <p className="text-muted">No rounds found.</p>
                      ) : (
                        <div className="overflow-x-auto">
                        <table className="stack-sm w-full text-[12.5px]">
                          <tbody className="divide-y divide-line">
                            {c.fundingRounds.map((r, i) => (
                              <tr key={i}>
                                <td className="py-2 pr-3 align-top whitespace-nowrap text-ink">{r.round}<div className="text-[11px] text-muted">{r.date ?? ""}</div></td>
                                <td className="px-3 py-2 align-top whitespace-nowrap tabular text-ink">{r.amountText ?? (r.amountUsdM != null ? money(r.amountUsdM) : "n/d")}</td>
                                <td className="py-2 pl-3 align-top text-ink-soft">
                                  {r.leadInvestors.length > 0 && <span className="font-medium">{r.leadInvestors.join(", ")}</span>}
                                  {r.otherInvestors.length > 0 && <span className="text-muted">{r.leadInvestors.length ? "; " : ""}{r.otherInvestors.join(", ")}</span>}
                                  {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 text-navy-700 hover:underline">↗</a>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
                        {c.sources.map((u) => (
                          <a key={u} href={u} target="_blank" rel="noreferrer" className="text-navy-700 hover:underline">{host(u)} ↗</a>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </Paged>
      </Card>

      {sweep.activeInvestors.length > 0 && (
        <Card pad={false}>
          <div className="px-6 pt-6"><SectionTitle eyebrow="Investor map" title="Who is funding this space" /></div>
          <div className="overflow-x-auto">
          <PagedTable
            pageSize={15}
            className="stack-sm w-full text-left text-[13px]"
            bodyClassName="divide-y divide-line"
            pagerClassName="border-t border-line px-5"
            head={
            <thead>
              <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-2.5 pr-3 pl-6 font-semibold">Investor</th>
                <th className="px-3 py-2.5 font-semibold">Type</th>
                <th className="px-3 py-2.5 font-semibold">Backed</th>
                <th className="py-2.5 pr-6 pl-3 font-semibold">Relevance to Genesys</th>
              </tr>
            </thead>
            }
            rows={sweep.activeInvestors.map((i) => (
                <tr key={i.name}>
                  <td data-label="Investor" className="py-3 pr-3 pl-6 align-top">
                    <div className="font-medium text-navy-900">{i.name}</div>
                    <div className="mt-0.5 flex gap-1.5">
                      {i.canadian && <span className="rounded-full bg-navy-50 px-1.5 py-px text-[10px] text-navy-700">Canadian</span>}
                      {i.genesysLike && <span className="rounded-full bg-brand-100 px-1.5 py-px text-[10px] text-brand-600">Genesys-like</span>}
                    </div>
                  </td>
                  <td data-label="Type" className="px-3 py-3 align-top text-ink-soft">{i.type}</td>
                  <td data-label="Backed" className="px-3 py-3 align-top text-ink-soft">{i.backedCompanies.join(", ")}</td>
                  <td data-label="Relevance to Genesys" className="py-3 pr-6 pl-3 align-top text-ink-soft">{i.relevance}</td>
                </tr>
              ))}
          />
          </div>
        </Card>
      )}

      {sweep.gaps && <p className="text-[12.5px] leading-relaxed text-muted"><span className="font-medium">Gaps: </span>{sweep.gaps}</p>}
    </div>
  );
}
