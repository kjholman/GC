import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { Card, PageHeader, SectionTitle, cx, fmtDate, relTime } from "@/components/ui";
import { describeEvent } from "@/lib/auditText";
import { AddUsersForm, UserRow } from "./AdminForms";
import { CreditPanel } from "./CreditPanel";
import { BILLING_URL, getAiStatus, measuredSpend } from "@/lib/ai/credit";
import { env } from "@/lib/env";
import { Pagination, pageParam } from "@/components/Pagination";


export default async function AdminPage({ searchParams }: PageProps<"/administration">) {
  await requireRole("ADMIN");
  const sp = await searchParams;
  const page = pageParam(sp.page);
  const peoplePage = pageParam(sp.people);
  const LOG_PAGE = 25;
  const PEOPLE_PAGE = 20;
  const qs = (people: number, log: number) => `/administration?${new URLSearchParams({ ...(people > 1 ? { people: String(people) } : {}), ...(log > 1 ? { page: String(log) } : {}) })}`;
  // Last activity: sessions stay open for days, so the last sign-in alone goes stale.
  const seen = await db.session.groupBy({ by: ["userId"], _max: { lastSeenAt: true } });
  const seenBy = new Map(seen.map((s) => [s.userId, s._max.lastSeenAt]));
  const lastActive = (u: { id: string; lastLoginAt: Date | null }) => {
    const times = [seenBy.get(u.id), u.lastLoginAt].filter((t): t is Date => !!t);
    return times.length ? new Date(Math.max(...times.map((t) => t.getTime()))) : null;
  };
  const [users, logs, ai, spend, paused, logTotal] = await Promise.all([
    db.user.findMany({ orderBy: [{ active: "desc" }, { email: "asc" }] }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * LOG_PAGE, take: LOG_PAGE, include: { user: { select: { email: true, name: true } } } }),
    getAiStatus(),
    measuredSpend(),
    db.analysis.count({ where: { status: "PAUSED" } }),
    db.auditLog.count(),
  ]);
  // Resolve the deals, people and documents mentioned in the log to readable names.
  const ids = [...new Set(logs.map((l) => l.entityId).filter(Boolean))] as string[];
  const [deals, people, docs, companies] = await Promise.all([
    db.deal.findMany({ where: { id: { in: ids } }, select: { id: true, companyName: true } }),
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } }),
    db.document.findMany({ where: { id: { in: ids } }, select: { id: true, filename: true } }),
    db.portfolioCompany.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const names: Record<string, string> = {
    ...Object.fromEntries(deals.map((d) => [d.id, d.companyName])),
    ...Object.fromEntries(people.map((p) => [p.id, p.name ?? p.email])),
    ...Object.fromEntries(docs.map((d) => [d.id, d.filename])),
    ...Object.fromEntries(companies.map((c) => [c.id, c.name])),
  };
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Team access"
        subtitle={<>Only people you add here can sign in, and they must use a <span className="font-medium">{env.allowedDomains.map((d) => `@${d}`).join(" or ")}</span> email address. Removing someone&apos;s access signs them out straight away.</>}
      />
      <a href="/administration/costs" className="mb-8 flex items-center justify-between gap-4 rounded-lg border border-line bg-paper px-5 py-4 transition-colors hover:border-navy-700">
        <span>
          <span className="block font-display text-[17px] font-semibold text-navy-900">AI spend and transactions</span>
          <span className="block text-[12.5px] text-muted">Every analysis with its deal, date, result and cost. Filter by month; break down by deal, purpose, model and day.</span>
        </span>
        <span className="text-navy-700">→</span>
      </a>
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card pad={false}>
          <div className="px-6 pt-6"><SectionTitle eyebrow="Team" title={`People with access (${users.filter((u) => u.active).length})`} /></div>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-3 pr-4 pl-6 font-semibold">Person</th>
                <th className="px-4 py-3 font-semibold">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.slice((peoplePage - 1) * PEOPLE_PAGE, peoplePage * PEOPLE_PAGE).map((u) => (
                <UserRow
                  key={u.id}
                  user={{
                    id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, active: u.active,
                    lastActive: lastActive(u) ? fmtDate(lastActive(u), true) : "Never",
                    lastActiveHint: u.lastLoginAt ? `Last signed in ${fmtDate(u.lastLoginAt, true)}` : "Has never signed in",
                  }}
                />
              ))}
            </tbody>
          </table>
          </div>
          <div id="people" className="border-t border-line px-5 empty:hidden"><Pagination page={peoplePage} pageSize={PEOPLE_PAGE} total={users.length} href={(p) => `${qs(p, page)}#people`} /></div>
        </Card>
        <div className="space-y-8">
          <CreditPanel
            lowSince={ai.creditLowSince?.toISOString() ?? null}
            lastOk={ai.lastOkAt?.toISOString() ?? null}
            lastChecked={ai.lastCheckedAt?.toISOString() ?? null}
            monthUsd={spend.monthUsd}
            allTimeUsd={spend.allTimeUsd}
            analysesThisMonth={spend.analysesThisMonth}
            perAnalysisUsd={spend.perAnalysisUsd}
            byPurpose={spend.byPurpose}
            models={{ main: env.anthropicModel, fast: env.anthropicFastModel, effort: env.analysisEffort }}
            paused={paused}
            billingUrl={BILLING_URL}
          />
          <AddUsersForm />
        </div>
      </div>

      <Card pad={false} className="mt-8">
        <div className="px-6 pt-6" id="activity">
          <SectionTitle eyebrow="Security" title="Recent activity" />
          <p className="-mt-3 mb-5 text-[13px] text-muted">Everything people do in GAIA is recorded here. Items in red are worth a look, such as blocked sign-in attempts.</p>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {logs.map((l) => {
            const who = l.user ? (l.user.name ?? l.user.email) : null;
            const e = describeEvent(l, who, names);
            return (
              <li key={l.id} className="flex items-start gap-4 px-6 py-3 text-[13.5px]">
                <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", e.warning ? "bg-neg" : "bg-brand-500")} />
                <span className={cx("flex-1", e.warning ? "text-neg" : "text-ink")}>{e.text}</span>
                <span className="shrink-0 text-[12px] text-muted" title={fmtDate(l.createdAt, true)}>{relTime(l.createdAt)}</span>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line px-5"><Pagination page={page} pageSize={LOG_PAGE} total={logTotal} href={(p) => `${qs(peoplePage, p)}#activity`} /></div>
      </Card>
    </>
  );
}
