import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { Card, PageHeader, SectionTitle, cx, fmtDate, relTime } from "@/components/ui";
import { describeEvent } from "@/lib/auditText";
import { AddUsersForm, UserRow } from "./AdminForms";


export default async function AdminPage() {
  const me = await requireRole("ADMIN");
  const [users, logs] = await Promise.all([
    db.user.findMany({ orderBy: [{ active: "desc" }, { email: "asc" }] }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { email: true, name: true } } } }),
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
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card pad={false}>
          <div className="px-6 pt-6"><SectionTitle eyebrow="Team" title={`People with access (${users.filter((u) => u.active).length})`} /></div>
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-3 pr-4 pl-6 font-semibold">Person</th>
                <th className="px-4 py-3 font-semibold">Access level</th>
                <th className="px-4 py-3 font-semibold">Last signed in</th>
                <th className="py-3 pr-6 pl-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <UserRow key={u.id} user={{ id: u.id, email: u.email, name: u.name, title: u.title, role: u.role, active: u.active, lastLoginAt: u.lastLoginAt ? fmtDate(u.lastLoginAt, true) : "Never" }} isSelf={u.id === me.id} />
              ))}
            </tbody>
          </table>
        </Card>
        <div><AddUsersForm /></div>
      </div>

      <Card pad={false} className="mt-8">
        <div className="px-6 pt-6">
          <SectionTitle eyebrow="Security" title="Recent activity" />
          <p className="-mt-3 mb-5 text-[13px] text-muted">Everything people do in the Sharminator is recorded here. Items in red are worth a look, such as blocked sign-in attempts.</p>
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
      </Card>
    </>
  );
}
