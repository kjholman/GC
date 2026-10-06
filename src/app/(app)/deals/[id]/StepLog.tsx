import { cx } from "@/components/ui";

export type LogStep = { at: string; text: string; kind: "start" | "info" | "done" | "warn" };

const MARK: Record<LogStep["kind"], { sym: string; cls: string }> = {
  start: { sym: "›", cls: "text-brand-600" },
  info: { sym: "·", cls: "text-muted" },
  done: { sym: "✓", cls: "text-pos" },
  warn: { sym: "!", cls: "text-warn" },
};

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Toronto" });
}

/** Step-by-step log of what the Sharminator did, oldest first. `live` marks the newest line as in progress. */
export function StepLog({ steps, live = false, empty, className }: { steps: LogStep[]; live?: boolean; empty?: string; className?: string }) {
  if (!steps.length) return <p className={cx("text-[13px] text-muted", className)}>{empty ?? "Waiting to start…"}</p>;
  return (
    <ol className={cx("space-y-1.5 font-mono text-[12.5px] leading-relaxed", className)}>
      {steps.map((s, i) => {
        const last = live && i === steps.length - 1;
        const m = MARK[s.kind] ?? MARK.info;
        return (
          <li key={`${s.at}-${i}`} className="flex gap-3">
            <span className="w-[92px] shrink-0 whitespace-nowrap text-right tabular text-muted">{clock(s.at)}</span>
            <span className={cx("w-3 shrink-0 text-center font-semibold", m.cls)}>
              {last && s.kind === "start" ? <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" /> : m.sym}
            </span>
            <span className={cx("min-w-0 [overflow-wrap:anywhere]", s.kind === "warn" ? "text-warn" : "text-ink")}>{s.text}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function asSteps(v: unknown): LogStep[] {
  return Array.isArray(v) ? (v as LogStep[]).filter((s) => s && typeof s.text === "string") : [];
}
