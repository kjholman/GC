import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { Card, PageHeader, SectionTitle, cx, fmtDate, relTime } from "@/components/ui";
import { AddUsersForm, UserRow } from "./AdminForms";

export const metadata = { title: "Administration" };

export default async function AdminPage() {
  const me = await requireRole("ADMIN");
  const [users, logs] = await Promise.all([
    db.user.findMany({ orderBy: [{ active: "desc" }, { email: "asc" }] }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 80, include: { user: { select: { email: true } } } }),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Access & audit"
        subtitle={<>Only allow-listed addresses at <span className="font-medium">{env.allowedDomains.map((d) => `@${d}`).join(", ")}</span> can request a sign-in code. Revoking access ends all of a user&apos;s sessions immediately.</>}
      />
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card pad={false}>
          <div className="px-6 pt-6"><SectionTitle eyebrow="Allow-list" title={`Authorised users (${users.filter((u) => u.active).length})`} /></div>
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-y border-line text-[11px] uppercase tracking-[0.12em] text-muted">
                <th className="py-3 pr-4 pl-6 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Last sign-in</th>
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
        <div className="px-6 pt-6"><SectionTitle eyebrow="Security" title="Audit log" /></div>
        <ul className="divide-y divide-line border-t border-line font-mono text-[12px]">
          {logs.map((l) => (
            <li key={l.id} className="grid grid-cols-[110px_230px_1fr_120px] gap-4 px-6 py-2.5">
              <span className="text-muted">{relTime(l.createdAt)}</span>
              <span className={cx(l.action.includes("rejected") || l.action.includes("invalid") || l.action.includes("revoked") ? "text-neg" : "text-navy-800")}>{l.action}</span>
              <span className="truncate text-ink-soft">
                {l.user?.email ?? (l.meta && typeof l.meta === "object" && "email" in l.meta ? String((l.meta as { email: unknown }).email) : "—")}
                {l.entity ? ` · ${l.entity} ${l.entityId?.slice(-6)}` : ""}
              </span>
              <span className="text-right text-muted">{l.ip ?? ""}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
