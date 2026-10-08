import Link from "next/link";
import { ChangeLog } from "@/components/ChangeLog";
import { pageParam } from "@/components/Pagination";
import { db } from "@/lib/db";
import { hasRole, requireUser } from "@/lib/auth/session";
import { Card, PageHeader, SectionTitle, cx } from "@/components/ui";
import { KnowledgeFiles, type KFile } from "@/components/KnowledgeFiles";
import { formatBytes } from "@/lib/knowledge/files";
import { FIELD_LABEL } from "@/lib/knowledge/suggest";
import { FIRM_SETTINGS } from "@/lib/training/settings";
import { Principles } from "./Principles";
import { PortfolioForm } from "./PortfolioForm";
import { PortfolioGrid } from "./PortfolioGrid";
import { Suggestions, type SuggestionView } from "./Suggestions";
import { BatchImport } from "./BatchImport";
import { DraftFromDocs } from "@/components/DraftFromDocs";
import { TellGaia } from "./TellGaia";
import { fmtDate } from "@/components/ui";

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const user = await requireUser();
  const sp = await searchParams;
  const canEdit = hasRole(user.role, "PARTNER");
  const [companies, principles, feedbackCount, kfiles, settingsSaved, pastDeals, pastWithDecks, pending] = await Promise.all([
    db.portfolioCompany.findMany({ orderBy: [{ outcome: "asc" }, { name: "asc" }] }),
    db.investmentPrinciple.findMany({ orderBy: { createdAt: "asc" } }),
    db.analysisFeedback.count(),
    db.knowledgeFile.findMany({
      where: { scope: { in: ["FIRM", "PORTFOLIO"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, scope: true, portfolioCompanyId: true, filename: true, sizeBytes: true, status: true, summary: true },
    }),
    db.firmSetting.count({ where: { key: { in: FIRM_SETTINGS.map((x) => x.key) } } }),
    db.historicalDeal.count(),
    db.historicalDeal.count({ where: { deckFilename: { not: null } } }),
    db.knowledgeSuggestion.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 60 }),
  ]);
  const toK = (f: (typeof kfiles)[number]): KFile => ({ id: f.id, filename: f.filename, size: formatBytes(f.sizeBytes), status: f.status, summary: f.summary });
  const firmFiles = kfiles.filter((f) => f.scope === "FIRM").map(toK);
  const filesByCompany: Record<string, KFile[]> = {};
  for (const f of kfiles.filter((x) => x.scope === "PORTFOLIO" && x.portfolioCompanyId)) (filesByCompany[f.portfolioCompanyId!] ??= []).push(toK(f));
  const exits = companies.filter((c) => c.outcome === "ACQUIRED" || c.outcome === "IPO" || c.outcome === "MERGED");
  const activePrinciples = principles.filter((p) => p.active).length;

  // Who last changed each portfolio company, and a per-company history view.
  const lastChanges = await db.auditLog.findMany({
    where: { entity: "PortfolioCompany", entityId: { in: companies.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    distinct: ["entityId"],
    select: { entityId: true, createdAt: true, user: { select: { name: true, email: true } } },
  });
  const updated: Record<string, string> = {};
  for (const l of lastChanges) updated[l.entityId!] = `${l.user ? l.user.name ?? l.user.email.split("@")[0] : "GAIA"}, ${fmtDate(l.createdAt)}`;
  const historyId = typeof sp.history === "string" ? sp.history : undefined;
  const historyName = historyId ? companies.find((c) => c.id === historyId)?.name : undefined;

  // Suggestions, with what is on record now for comparison.
  const byId = new Map(companies.map((c) => [c.id, c]));
  const suggestions: SuggestionView[] = pending.map((s) => {
    const data = s.data as Record<string, unknown>;
    const current = s.targetId ? (byId.get(s.targetId) as Record<string, unknown> | undefined) : undefined;
    const label = (k: string) =>
      s.kind === "PRINCIPLE" ? (k === "title" ? "Title" : "Principle")
      : s.kind === "SETTING" ? "Value"
      : s.kind === "PAST_DEAL" ? ({ companyName: "Company", year: "Year", decision: "Decision", rationale: "Rationale", outcome: "Outcome", sector: "Sector" } as Record<string, string>)[k] ?? k
      : FIELD_LABEL[k] ?? k;
    return {
      id: s.id, kind: s.kind, title: s.title, sourceLabel: s.sourceLabel,
      fields: Object.entries(data)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => ({ key: k, label: label(k), value: String(v), current: current?.[k] != null ? String(current[k]) : null, long: ["description", "lessons", "outcomeNotes", "body", "rationale", "value"].includes(k) })),
    };
  });

  // Knowledge health: what GAIA uses, how complete it is, and the next thing to add.
  const pct = (n: number, of: number) => (of ? Math.min(1, n / of) : 0);
  const health = [
    { label: "Firm settings confirmed", done: settingsSaved, of: FIRM_SETTINGS.length, href: "/training/prompt", todo: `Confirm ${FIRM_SETTINGS.length - settingsSaved} firm setting${FIRM_SETTINGS.length - settingsSaved === 1 ? "" : "s"} (cheque size, mandate, return hurdle)` },
    { label: "Investment principles", done: activePrinciples, of: 8, href: "#principles", todo: "Add the partnership's standing rules, or import them from the template" },
    { label: "Firm documents read", done: firmFiles.filter((f) => f.status === "READY").length, of: 3, href: "#add", todo: "Upload the fund strategy, LP reports or portfolio reviews; GAIA suggests updates from them" },
    { label: "Portfolio companies on record", done: companies.length, of: Math.max(10, companies.length), href: "#add", todo: "Upload a portfolio list or import the portfolio template" },
    { label: "Portfolio websites", done: companies.filter((c) => c.website).length, of: companies.length, href: "#portfolio", todo: "Add websites so GAIA recognises companies that pitch again (try Fill from the web)" },
    { label: "Portfolio financials", done: companies.filter((c) => c.checkSize || c.entryValuation).length, of: companies.length, href: "#portfolio", todo: "Add investment, valuation and returns so GAIA can benchmark deal terms" },
    { label: "Lessons from exits", done: exits.filter((c) => c.lessons).length, of: exits.length, href: "#portfolio", todo: "Record what the partnership learned from each exit" },
    { label: "Past deals in the archive", done: pastDeals, of: Math.max(30, pastDeals), href: "/training/archive", todo: "Import past decisions, including deals Genesys passed on" },
    { label: "Past deals with decks", done: pastWithDecks, of: Math.max(10, pastDeals), href: "/training/archive", todo: "Attach original decks so accuracy tests can run" },
    { label: "Partner reviews", done: feedbackCount, of: 20, href: "/deals", todo: "Review finished memos; each review becomes a lesson" },
  ].filter((h) => h.of > 0);
  const score = Math.round((health.reduce((n, h) => n + pct(h.done, h.of), 0) / health.length) * 100);
  const next = health.filter((h) => pct(h.done, h.of) < 1).sort((a, b) => pct(a.done, a.of) - pct(b.done, b.of)).slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow="Institutional memory"
        title="Knowledge base"
        subtitle="What GAIA knows about Genesys: the portfolio, the partnership's principles and the firm's own documents. Every analysis draws on it. The quickest way to build it is to upload documents you already have and accept GAIA's suggestions."
      />

      <Card className="mb-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <div className="eyebrow">Knowledge health</div>
            <div className="mt-2 font-display text-[44px] font-semibold leading-none tabular text-navy-900">{score}%</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand-500" style={{ width: `${score}%` }} /></div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">How complete the knowledge GAIA draws on is. Higher means sharper, more Genesys-specific memos.</p>
          </div>
          <div>
            {next.length > 0 && (
              <>
                <div className="mb-2 text-[13px] font-medium text-navy-900">Most useful next steps</div>
                <ol className="mb-4 space-y-1.5 text-[13.5px]">
                  {next.map((h, i) => (
                    <li key={h.label} className="flex gap-2">
                      <span className="font-display font-semibold text-brand-500 tabular">{i + 1}</span>
                      <Link href={h.href} className="text-navy-800 hover:underline">{h.todo}</Link>
                    </li>
                  ))}
                </ol>
              </>
            )}
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-[12.5px] sm:grid-cols-2">
              {health.map((h) => (
                <li key={h.label} className="flex items-center gap-2">
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", pct(h.done, h.of) >= 1 ? "bg-pos" : pct(h.done, h.of) > 0 ? "bg-warn" : "bg-line-strong")} />
                  <span className="text-ink-soft">{h.label}</span>
                  <span className="ml-auto tabular text-ink">{h.done}{h.label.startsWith("Portfolio companies") || h.label.startsWith("Past deals in") || h.label === "Partner reviews" || h.label === "Investment principles" || h.label === "Firm documents read" ? "" : ` of ${h.of}`}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {canEdit && <Suggestions items={suggestions} />}

      {canEdit && (
        <Card className="mb-8">
          <SectionTitle eyebrow="Quick add" title="Tell GAIA something" />
          <p className="-mt-3 mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
            A new round, an exit, a lesson from a board meeting, a rule the partners agreed: write it the way you would say it, or paste an email.
          </p>
          <TellGaia />
        </Card>
      )}

      <div id="add" className="scroll-mt-6" />
      <Card className="mb-8">
        <SectionTitle eyebrow="Add knowledge" title="Upload anything about Genesys" />
        <p className="-mt-3 mb-4 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
          Fund strategy, LP and portfolio reports, IC memos, quarterly updates, cap tables, spreadsheets: any format, any size. GAIA reads each file, uses it in every analysis, and suggests portfolio companies, principles and firm settings from it for you to accept.
        </p>
        <KnowledgeFiles scope="FIRM" files={firmFiles} canEdit={canEdit} />
        {canEdit && firmFiles.some((f) => f.status === "READY") && (
          <div className="mt-4"><DraftFromDocs label="Find more in these documents" /></div>
        )}
        {canEdit && (
          <div className="mt-6 border-t border-line pt-5">
            <div className="mb-1 text-[14px] font-medium text-navy-900">Or import a spreadsheet</div>
            <p className="mb-2 text-[12.5px] text-muted">Download a template, fill it in (Excel or CSV), and upload it.</p>
            <BatchImport />
          </div>
        )}
      </Card>

      <div className="mb-8" id="principles">
        <Principles principles={principles} canEdit={canEdit} />
      </div>

      <div id="portfolio" className="mb-3 flex items-end justify-between gap-3">
        <SectionTitle eyebrow={`${companies.length} companies · ${exits.length} exits`} title="Portfolio" />
      </div>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <PortfolioGrid companies={companies} files={filesByCompany} canEdit={canEdit} updated={updated} />
        {canEdit && (
          <div>
            <div className="sticky top-10">
              <PortfolioForm company={null} />
            </div>
          </div>
        )}
      </div>
      <div className="mt-10" id="changes">
        <ChangeLog
          prefixes={["portfolio.", "principle.", "training.suggestion_accepted", "knowledge."]}
          page={pageParam(sp.changes)}
          href={(p) => `/knowledge?changes=${p}${historyId ? `&history=${historyId}` : ""}#changes`}
          title={historyName ? `Changes to ${historyName}` : "Changes to the knowledge base"}
          entityId={historyId}
          undoable={canEdit}
          extra={historyName ? <p className="-mt-3 mb-4 text-[13px]"><Link href="/knowledge#changes" className="font-medium text-navy-700 hover:underline">Show all changes</Link></p> : null}
        />
      </div>
    </>
  );
}
