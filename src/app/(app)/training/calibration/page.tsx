import Link from "next/link";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import { Card, Empty, SectionTitle, cx, relTime } from "@/components/ui";
import { GenerateSuggestions, SuggestionActions } from "./CalibrationActions";


const VERDICTS = ["AGREE", "TOO_OPTIMISTIC", "TOO_PESSIMISTIC", "WRONG_DECISION"] as const;
const VCLS: Record<string, string> = { AGREE: "bg-pos", TOO_OPTIMISTIC: "bg-warn", TOO_PESSIMISTIC: "bg-info", WRONG_DECISION: "bg-neg" };

export default async function CalibrationPage() {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "PARTNER");
  const [feedback, suggestions] = await Promise.all([
    db.analysisFeedback.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } }, analysis: { select: { version: true, recommendation: true, deal: { select: { id: true, companyName: true, sector: true } } } } },
    }),
    db.principleSuggestion.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "desc" } }),
  ]);
  const total = feedback.length;
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, feedback.filter((f) => f.verdict === v).length]));
  const sectors = new Map<string, Record<string, number>>();
  for (const f of feedback) {
    const s = f.analysis.deal.sector ?? "Unclassified";
    const row = sectors.get(s) ?? { AGREE: 0, TOO_OPTIMISTIC: 0, TOO_PESSIMISTIC: 0, WRONG_DECISION: 0 };
    row[f.verdict]++;
    sectors.set(s, row);
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <SectionTitle eyebrow="Partner reviews" title="Where the Sharminator differs from the partners" />
          {total === 0 ? (
            <p className="text-[14px] text-muted">No reviews yet. Partners can review any memo from the deal page.</p>
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-line">
                {VERDICTS.map((v) => counts[v] ? <div key={v} className={VCLS[v]} style={{ width: `${(counts[v] / total) * 100}%` }} /> : null)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                {VERDICTS.map((v) => (
                  <div key={v}>
                    <div className="flex items-center gap-2 text-[12px] text-muted"><span className={cx("h-2 w-2 rounded-full", VCLS[v])} />{v.replaceAll("_", " ").toLowerCase()}</div>
                    <div className="mt-1 pl-4 font-display font-semibold text-2xl tabular text-navy-900">{counts[v]}</div>
                  </div>
                ))}
              </div>
              <table className="mt-8 w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                    <th className="py-2 pr-4 font-semibold">Sector</th>
                    {VERDICTS.map((v) => <th key={v} className="px-3 py-2 text-right font-semibold">{v.replaceAll("_", " ").toLowerCase()}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...sectors.entries()].map(([s, row]) => (
                    <tr key={s}>
                      <td className="py-2.5 pr-4 text-ink">{s}</td>
                      {VERDICTS.map((v) => <td key={v} className={cx("px-3 py-2.5 text-right tabular", row[v] && v !== "AGREE" ? "font-medium text-ink" : "text-muted")}>{row[v]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>

        <Card>
          <div className="eyebrow mb-1 text-brand-600">Turn feedback into rules</div>
          <h3 className="font-display font-semibold text-[20px] text-navy-900">Suggested principles</h3>
          <p className="mt-1.5 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
            The Sharminator looks for corrections the partners keep making and drafts new principles from them. Nothing changes until a partner accepts a suggestion.
          </p>
          {canEdit && <GenerateSuggestions disabled={total < 3} />}
          <div className="mt-5 space-y-4">
            {suggestions.map((s) => (
              <div key={s.id} className="rounded-lg border border-line bg-mist/60 p-4">
                <div className="text-[14px] font-medium text-navy-900">{s.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink">{s.body}</p>
                <p className="mt-2 text-[12px] leading-relaxed text-muted"><span className="font-medium">Evidence: </span>{s.evidence}</p>
                {canEdit && <SuggestionActions id={s.id} />}
              </div>
            ))}
            {suggestions.length === 0 && <p className="text-[12.5px] text-muted">No pending suggestions.</p>}
          </div>
        </Card>
      </div>

      <Card pad={false}>
        <div className="px-6 pt-6"><SectionTitle eyebrow="Log" title="All partner reviews" /></div>
        {feedback.length === 0 ? (
          <div className="px-6 pb-6"><Empty title="No reviews yet" /></div>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {feedback.map((f) => (
              <li key={f.id} className="grid gap-2 px-6 py-4 md:grid-cols-[220px_160px_1fr_110px]">
                <Link href={`/deals/${f.analysis.deal.id}?v=${f.analysis.version}`} className="text-[13.5px] font-medium text-navy-900 hover:underline">
                  {f.analysis.deal.companyName} <span className="text-[11.5px] font-normal text-muted">v{f.analysis.version}</span>
                </Link>
                <span className="text-[12.5px] text-ink-soft">
                  <span className={cx("mr-2 inline-block h-2 w-2 rounded-full", VCLS[f.verdict])} />
                  {f.verdict.replaceAll("_", " ").toLowerCase()}
                  {f.correctedRecommendation && <span className="block pl-4 text-[11.5px] text-muted">→ {f.correctedRecommendation.replaceAll("_", " ").toLowerCase()}</span>}
                </span>
                <p className="text-[13px] leading-relaxed text-ink-soft">{f.comment}</p>
                <span className="text-right text-[11.5px] text-muted">{f.user.name ?? f.user.email.split("@")[0]} · {relTime(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
