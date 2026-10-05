import type { ReactNode } from "react";
import type { DealStatus } from "@prisma/client";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("rounded-[3px] border border-line bg-paper shadow-[var(--shadow-card)]", pad && "p-6", className)}>
      {children}
    </section>
  );
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h2 className="font-serif text-[22px] leading-tight text-navy-900">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2 text-gold-600">{eyebrow}</div>}
        <h1 className="font-serif text-[34px] leading-[1.1] tracking-[-0.01em] text-navy-900">{title}</h1>
        {subtitle && <div className="mt-2 max-w-3xl text-[15px] text-ink-soft">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}

export const STATUS_META: Record<DealStatus, { label: string; cls: string; dot: string }> = {
  SCREENING: { label: "Screening", cls: "bg-navy-50 text-navy-800 border-navy-100", dot: "bg-navy-700" },
  PENDING_INFO: { label: "Pending information", cls: "bg-warn-bg text-warn border-[#efdcb4]", dot: "bg-warn" },
  DILIGENCE: { label: "Due diligence", cls: "bg-pos-bg text-pos border-[#c9e2d9]", dot: "bg-pos" },
  IC_REVIEW: { label: "IC review", cls: "bg-info-bg text-info border-[#d3d9f1]", dot: "bg-info" },
  INVESTED: { label: "Invested", cls: "bg-navy-900 text-gold-300 border-navy-900", dot: "bg-gold-500" },
  REJECTED: { label: "Declined", cls: "bg-neg-bg text-neg border-[#efd2ce]", dot: "bg-neg" },
  ARCHIVED: { label: "Archived", cls: "bg-[#f1efea] text-muted border-line", dot: "bg-muted" },
};

export function StatusBadge({ status }: { status: DealStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium", m.cls)}>
      <span className={cx("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

export const REC_META: Record<string, { label: string; cls: string }> = {
  REJECT: { label: "Decline", cls: "text-neg" },
  PENDING_INFO: { label: "Request information", cls: "text-warn" },
  ADVANCE_TO_DILIGENCE: { label: "Advance to diligence", cls: "text-pos" },
};

export function scoreColor(score: number) {
  if (score >= 70) return "var(--color-pos)";
  if (score >= 50) return "var(--color-gold-500)";
  if (score >= 35) return "var(--color-warn)";
  return "var(--color-neg)";
}

export function ScoreRing({ score, size = 88, label = "Score" }: { score: number | null | undefined; size?: number; label?: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth="4" />
        {score != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={scoreColor(score)}
            strokeWidth="4"
            strokeDasharray={`${c * pct} ${c}`}
            strokeLinecap="butt"
          />
        )}
      </svg>
      <div className="absolute text-center leading-none">
        <div className="font-serif tabular text-navy-900" style={{ fontSize: size * 0.32 }}>
          {score ?? "—"}
        </div>
        {size >= 72 && <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">{label}</div>}
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[3px] px-4 py-2.5 text-[13.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-navy-900 text-white hover:bg-navy-800",
        variant === "secondary" && "border border-line-strong bg-paper text-navy-900 hover:border-navy-700 hover:bg-navy-50",
        variant === "ghost" && "text-navy-800 hover:bg-navy-50",
        variant === "danger" && "border border-[#e3c3be] bg-paper text-neg hover:bg-neg-bg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export const inputCls =
  "w-full rounded-[3px] border border-line-strong bg-paper px-3.5 py-2.5 text-[14px] text-ink placeholder:text-[#9aa1ab] focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-muted">{hint}</span>}
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[3px] border border-dashed border-line-strong bg-paper/60 px-6 py-12 text-center">
      <div className="font-serif text-lg text-navy-900">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function fmtDate(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "America/Toronto",
  });
}

export function relTime(d: Date) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}
