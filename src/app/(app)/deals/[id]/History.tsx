import Link from "next/link";
import type { Memo } from "@/lib/ai/schema";
import { Card, REC_META, SectionTitle, cx, fmtDate } from "@/components/ui";

// ─── Gaps that need a person ────────────────────────────────────────────────

const WHO: Record<string, string> = { FOUNDERS: "Founders", GENESYS_TEAM: "Genesys team", EXTERNAL_EXPERT: "External expert" };
const PRIORITY: Record<string, { label: string; cls: string; order: number }> = {
  CRITICAL: { label: "Critical", cls: "bg-neg text-white", order: 0 },
  IMPORTANT: { label: "Important", cls: "bg-warn-bg text-warn", order: 1 },
  SUPPLEMENTARY: { label: "Nice to have", cls: "bg-mist text-ink-soft", order: 2 },
};

export function GapsView({ memo }: { memo: Memo }) {
  const gaps = [...(memo.gaps ?? [])].sort((a, b) => (PRIORITY[a.priority]?.order ?? 3) - (PRIORITY[b.priority]?.order ?? 3));
  return (
    <Card>
      <SectionTitle eyebrow="Needs manual follow-up" title="Gaps the Sharminator could not close" />
      <p className="-mt-3 mb-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
        Everything material this analysis could not establish from the materials or public sources, why, and the specific step a person needs to take.
        Critical gaps could change the decision.
      </p>
      {gaps.length === 0 ? (
        <p className="text-[14px] text-muted">{memo.gaps ? "No material gaps were identified." : "This memo was written before gap tracking was added. Re-run the analysis to list its gaps."}</p>
      ) : (
        <ol className="space-y-4">
          {gaps.map((g, i) => (
            <li key={i} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx("rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]", PRIORITY[g.priority]?.cls)}>{PRIORITY[g.priority]?.label ?? g.priority}</span>
                <span className="text-[12px] font-medium text-muted">{g.area}</span>
                <span className="ml-auto text-[12px] text-muted">Who can close it: <span className="font-medium text-ink">{WHO[g.whoCanClose] ?? g.whoCanClose}</span></span>
              </div>
              <p className="mt-2 text-[14px] font-medium text-ink">{g.gap}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft"><span className="text-muted">Why it&apos;s a gap: </span>{g.whyItIsAGap}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink"><span className="text-muted">What to do: </span>{g.howToClose}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ─── Version history ────────────────────────────────────────────────────────

export type VersionRow = {
  id: string;
  version: number;
  trigger: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
  recommendation: string | null;
  overallScore: number | null;
  versionDelta: string | null;
  analystContext: string | null;
  by: string | null;
  costUsd: number | null;
  newFiles: string[];
};

const TRIGGER: Record<string, string> = { INITIAL_SCREEN: "First screen", NEW_INFORMATION: "New information received", RERUN: "Re-run" };
const STATUS: Record<string, string> = { QUEUED: "Waiting to start", RUNNING: "In progress", FAILED: "Didn't finish", STOPPED: "Stopped", PAUSED: "Paused (out of credit)", COMPLETE: "Finished" };

export function VersionHistory({ dealPath, rows, shownId }: { dealPath: string; rows: VersionRow[]; shownId: string | null }) {
  // rows: newest first. Compare each finished version with the previous finished one.
  const finished = rows.filter((r) => r.status === "COMPLETE");
  return (
    <Card>
      <SectionTitle eyebrow="Every iteration" title="Analysis history" />
      <p className="-mt-3 mb-6 text-[13.5px] text-ink-soft">
        Each version builds on the one before: the Sharminator receives the previous memo, its open requests and the team&apos;s feedback, and explains what changed.
      </p>
      <ol className="relative space-y-6 border-l border-line pl-6">
        {rows.map((r) => {
          const prev = finished.find((f) => f.version < r.version);
          const scoreDelta = r.overallScore != null && prev?.overallScore != null ? r.overallScore - prev.overallScore : null;
          const recChanged = r.recommendation && prev?.recommendation && r.recommendation !== prev.recommendation;
          return (
            <li key={r.id} className="relative">
              <span className={cx("absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-paper", r.status === "COMPLETE" ? "bg-brand-500" : "bg-line-strong")} />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-display text-[17px] font-semibold text-navy-900">Version {r.version}</span>
                <span className="text-[12.5px] text-muted">{TRIGGER[r.trigger] ?? r.trigger}{r.by ? ` · ${r.by}` : ""} · {fmtDate(r.completedAt ?? r.createdAt, true)}</span>
                {r.id === shownId ? (
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">Showing</span>
                ) : r.status === "COMPLETE" ? (
                  <Link href={`${dealPath}?v=${r.version}`} className="text-[12.5px] text-navy-700 hover:underline">View this version</Link>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                {r.recommendation ? (
                  <span className={cx("font-medium", REC_META[r.recommendation]?.cls)}>{REC_META[r.recommendation]?.label}</span>
                ) : (
                  <span className="text-muted">{STATUS[r.status] ?? r.status}</span>
                )}
                {r.overallScore != null && (
                  <span className="tabular text-ink">
                    Score {r.overallScore}
                    {scoreDelta != null && scoreDelta !== 0 && <span className={scoreDelta > 0 ? "text-pos" : "text-neg"}> ({scoreDelta > 0 ? "+" : ""}{scoreDelta})</span>}
                  </span>
                )}
                {recChanged && <span className="text-[12px] text-warn">Decision changed from {REC_META[prev!.recommendation!]?.label}</span>}
                {r.costUsd != null && <span className="text-[12px] text-muted">AI cost about US${r.costUsd.toFixed(2)}</span>}
              </div>
              {r.newFiles.length > 0 && (
                <p className="mt-1.5 text-[12.5px] text-ink-soft"><span className="text-muted">New materials: </span>{r.newFiles.join(", ")}</p>
              )}
              {r.analystContext && <p className="mt-1 text-[12.5px] text-ink-soft"><span className="text-muted">Team note: </span>{r.analystContext}</p>}
              {r.status === "COMPLETE" && (
                <div className="mt-2 rounded-lg bg-mist px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand-600">What changed</div>
                  {r.versionDelta ?? (r.version === 1 || !prev ? "First analysis of this deal." : "No summary of changes was recorded for this version.")}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ─── Every source behind the analysis ───────────────────────────────────────

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;
const clean = (u: string) => u.replace(/[.,;:]+$/, "");

export function collectWebSources(parts: { label: string; text: string | null | undefined }[]) {
  const map = new Map<string, Set<string>>();
  for (const p of parts) {
    for (const m of (p.text ?? "").matchAll(URL_RE)) {
      const u = clean(m[0]);
      if (!map.has(u)) map.set(u, new Set());
      map.get(u)!.add(p.label);
    }
  }
  return [...map.entries()].map(([url, used]) => ({ url, used: [...used] })).sort((a, b) => a.url.localeCompare(b.url));
}

export function SourcesList({ documents, web }: {
  documents: { id: string; filename: string; round: number; pageCount: number | null }[];
  web: { url: string; used: string[] }[];
}) {
  return (
    <Card>
      <SectionTitle eyebrow="Bibliography" title="All sources used in this analysis" />
      <div className="eyebrow mb-2">Company materials ({documents.length})</div>
      <ul className="mb-6 space-y-1 text-[13px]">
        {documents.map((d) => (
          <li key={d.id}>
            <a href={`/api/documents/${d.id}`} target="_blank" className="text-navy-800 hover:underline [overflow-wrap:anywhere]">{d.filename}</a>
            <span className="text-muted"> · round {d.round}{d.pageCount ? ` · ${d.pageCount} pages` : ""}</span>
          </li>
        ))}
      </ul>
      <div className="eyebrow mb-2">Web sources ({web.length})</div>
      {web.length === 0 ? (
        <p className="text-[13px] text-muted">No web sources were used for this version.</p>
      ) : (
        <ul className="space-y-1.5 text-[13px]">
          {web.map((w) => (
            <li key={w.url} className="flex flex-wrap gap-x-2">
              <a href={w.url} target="_blank" rel="noreferrer" className="min-w-0 text-navy-800 hover:underline [overflow-wrap:anywhere]">{w.url.replace(/^https?:\/\/(www\.)?/, "")}</a>
              <span className="text-[12px] text-muted">{w.used.join(", ")}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ─── Why not to pursue ──────────────────────────────────────────────────────

/** The case against the deal, shown up front for declined (and on-hold) deals. */
export function PassReasons({ memo }: { memo: Memo }) {
  if (memo.recommendation === "ADVANCE_TO_DILIGENCE") return null;
  const reject = memo.recommendation === "REJECT";
  // Older memos predate passReasons: fall back to red flags, serious risks and the weakest scores.
  const reasons =
    memo.passReasons?.length
      ? memo.passReasons
      : [
          ...memo.redFlags.map((r) => ({ reason: r, explanation: "", wouldChangeIf: "" })),
          ...memo.keyRisks.filter((r) => r.severity === "HIGH").map((r) => ({ reason: r.risk, explanation: r.mitigation ? `Possible mitigation: ${r.mitigation}` : "", wouldChangeIf: "" })),
          ...memo.scorecard.filter((s) => s.score <= 4).map((s) => ({ reason: `${s.dimension}: ${s.score}/10`, explanation: s.assessment, wouldChangeIf: "" })),
        ];
  if (!reasons.length) return null;
  return (
    <section className={cx("rounded-xl border px-5 py-5 sm:px-6", reject ? "border-[#efd2ce] bg-neg-bg/60" : "border-[#efdcb4] bg-warn-bg/60")}>
      <div className={cx("eyebrow", reject ? "!text-neg" : "!text-warn")}>{reject ? "Why not to pursue" : "What's holding this back"}</div>
      <p className="mt-1 text-[14.5px] font-medium text-ink">{memo.worthOurTime.headline.replace(/\s?\[E\d+\]/g, "")}</p>
      <ol className="mt-4 space-y-3">
        {reasons.map((r, i) => (
          <li key={i} className="flex gap-3 text-[13.5px]">
            <span className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white", reject ? "bg-neg" : "bg-warn")}>{i + 1}</span>
            <div className="min-w-0">
              <div className="font-medium text-ink">{r.reason}</div>
              {r.explanation && <p className="mt-0.5 leading-relaxed text-ink-soft">{r.explanation.replace(/\s?\[E\d+\]/g, "")}</p>}
              {r.wouldChangeIf && <p className="mt-0.5 text-[12.5px] text-muted"><span className="font-medium">Would change if: </span>{r.wouldChangeIf}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
