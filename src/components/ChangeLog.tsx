import { db } from "@/lib/db";
import { describeEvent } from "@/lib/auditText";
import type { FieldChange } from "@/lib/changes";
import { Card, SectionTitle, cx, fmtDate } from "./ui";
import { Pagination } from "./Pagination";
import { UndoButton } from "./UndoButton";

const UNDOABLE_ENTITIES = new Set(["PortfolioCompany", "InvestmentPrinciple", "FirmSetting", "HistoricalDeal"]);

/** Paginated history of who changed what, with before → after for each field. */
export async function ChangeLog({ prefixes, page, href, title, eyebrow = "Change history", pageSize = 20, entityId, undoable = false, extra }: {
  prefixes: string[]; page: number; href: (p: number) => string; title: string; eyebrow?: string; pageSize?: number;
  /** Only changes to this one record. */
  entityId?: string;
  /** Offer Undo on changes that can be reversed. */
  undoable?: boolean;
  extra?: React.ReactNode;
}) {
  const where = { OR: prefixes.map((p) => ({ action: { startsWith: p } })), ...(entityId ? { entityId } : {}) };
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { name: true, email: true } } } }),
    db.auditLog.count({ where }),
  ]);
  return (
    <Card pad={false}>
      <div className="px-6 pt-6">
        <SectionTitle eyebrow={eyebrow} title={title} />
        <p className="-mt-3 mb-5 text-[13px] text-muted">Every addition, edit and removal, with who made it and what changed.{undoable ? " Anything here can be undone." : ""}</p>
        {extra}
      </div>
      {logs.length === 0 ? (
        <p className="border-t border-line px-6 py-5 text-[13px] text-muted">No changes recorded yet.</p>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {logs.map((l) => {
            const who = l.user ? l.user.name ?? l.user.email.split("@")[0] : null;
            const { text, warning } = describeEvent(l, who, {});
            const changes = ((l.meta as { changes?: FieldChange[] } | null)?.changes ?? []).filter(Boolean);
            return (
              <li key={l.id} className="px-6 py-3 text-[13.5px]">
                <div className="flex items-start gap-3">
                  <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", warning ? "bg-neg" : "bg-brand-500")} />
                  <span className="min-w-0 flex-1 text-ink">{text}</span>
                  <span className="shrink-0 text-[12px] text-muted">{fmtDate(l.createdAt, true)}</span>
                  {undoable && (() => {
                    const m = (l.meta ?? {}) as { before?: unknown; created?: boolean; undone?: boolean; name?: string };
                    const can = !!l.entityId && UNDOABLE_ENTITIES.has(l.entity ?? "") && !l.action.startsWith("knowledge.undone") && !m.undone
                      && (m.before != null || m.created === true || l.action.endsWith(".created"));
                    if (m.undone) return <span className="shrink-0 text-[12px] text-muted">Undone</span>;
                    return can ? <UndoButton auditId={l.id} what={text} /> : null;
                  })()}
                </div>
                {changes.length > 0 && (
                  <details className="mt-1.5 pl-4.5">
                    <summary className="cursor-pointer text-[12.5px] text-navy-700">{changes.length} field{changes.length === 1 ? "" : "s"} changed</summary>
                    <dl className="mt-2 space-y-2 text-[12.5px]">
                      {changes.map((c, i) => (
                        <div key={i} className="rounded-lg bg-mist px-3 py-2">
                          <dt className="font-medium text-ink">{c.field}</dt>
                          <dd className="mt-0.5 text-muted line-through decoration-line-strong [overflow-wrap:anywhere]">{c.from}</dd>
                          <dd className="text-ink [overflow-wrap:anywhere]">{c.to}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-line px-5"><Pagination page={page} pageSize={pageSize} total={total} href={href} /></div>
    </Card>
  );
}
