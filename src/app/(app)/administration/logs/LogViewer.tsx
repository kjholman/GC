"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx, inputCls } from "@/components/ui";

type Line = { id: string; at: string; level: string; source: string; message: string; analysisId: string | null };

const MAX_LINES = 3000;
const LEVEL_CLS: Record<string, string> = {
  debug: "text-muted",
  info: "text-navy-900",
  warn: "text-amber-700",
  error: "text-red-700",
};
const LEVEL_OPTIONS = [
  { value: "", label: "All levels" },
  { value: "info", label: "Info and above" },
  { value: "warn", label: "Warnings and errors" },
  { value: "error", label: "Errors only" },
];

const time = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour12: false })}`;
};

export function LogViewer() {
  const [lines, setLines] = useState<Line[]>([]);
  const [level, setLevel] = useState("");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [olderDone, setOlderDone] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [held, setHeld] = useState<Line[]>([]);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const params = useCallback(
    (extra: Record<string, string> = {}) => new URLSearchParams({ ...(level ? { level } : {}), ...(q ? { q } : {}), ...extra }).toString(),
    [level, q],
  );

  useEffect(() => {
    // Reset for a new filter, then connect.
    /* eslint-disable react-hooks/set-state-in-effect */
    setLines([]);
    setHeld([]);
    setOlderDone(false);
    setStatus("connecting");
    /* eslint-enable react-hooks/set-state-in-effect */
    const es = new EventSource(`/api/logs/stream?${params({ tail: "300" })}`);
    es.onopen = () => setStatus("live");
    es.onerror = () => setStatus("reconnecting");
    es.onmessage = (e) => {
      const line = JSON.parse(e.data) as Line;
      if (pausedRef.current) { setHeld((h) => [...h, line].slice(-MAX_LINES)); return; }
      setLines((prev) => [...prev, line].slice(-MAX_LINES));
    };
    return () => es.close();
  }, [params]);

  // Resuming shows what arrived while paused.
  const togglePause = () => {
    if (paused && held.length) {
      setLines((prev) => [...prev, ...held].slice(-MAX_LINES));
      setHeld([]);
    }
    pausedRef.current = !paused;
    setPaused(!paused);
  };

  // Follow the newest line unless the reader has scrolled up.
  useEffect(() => {
    const el = box.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const loadOlder = async () => {
    if (!lines.length) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/logs?${params({ before: lines[0].id, limit: "300" })}`);
      const { lines: older } = (await res.json()) as { lines: Line[] };
      if (older.length < 300) setOlderDone(true);
      const el = box.current;
      const from = el ? el.scrollHeight - el.scrollTop : 0;
      setLines((prev) => [...older, ...prev]);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - from; });
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-paper">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <div className="w-56"><select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level">
          {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select></div>
        <div className="w-72"><input className={inputCls} placeholder="Search the log" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <button type="button" onClick={togglePause} className="rounded-lg border border-line-strong px-4 py-2.5 text-[13.5px] font-medium text-navy-900 hover:border-navy-700">
          {paused ? `Resume${held.length ? ` (${held.length} new)` : ""}` : "Pause"}
        </button>
        <span className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">
          <span className={cx("h-2 w-2 rounded-full", status === "live" ? (paused ? "bg-amber-500" : "bg-emerald-500") : "bg-gray-400")} />
          {status === "live" ? (paused ? "Paused" : "Live") : status === "connecting" ? "Connecting" : "Reconnecting"}
          {" · "}{lines.length.toLocaleString()} lines
        </span>
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="h-[70vh] overflow-y-auto px-4 py-2 font-mono text-[12px] leading-[1.55]"
      >
        {lines.length > 0 && !olderDone && (
          <button type="button" onClick={loadOlder} disabled={loadingOlder} className="mb-2 text-[12px] font-medium text-navy-700 hover:underline disabled:opacity-50">
            {loadingOlder ? "Loading…" : "Load older lines"}
          </button>
        )}
        {lines.length === 0 && <p className="py-6 text-center font-sans text-[13px] text-muted">{status === "live" ? "No log lines match yet. New lines appear here as they are written." : "Connecting to the log…"}</p>}
        {lines.map((l) => (
          <div key={l.id} className={cx("whitespace-pre-wrap break-words", LEVEL_CLS[l.level] ?? "")}>
            <span className="text-muted">{time(l.at)}</span>{" "}
            <span className="uppercase">{l.level.padEnd(5)}</span>{" "}
            <span className="text-navy-700">[{l.source}]</span>{" "}
            {l.message}
            {l.analysisId && <span className="text-muted"> (analysis {l.analysisId.slice(-6)})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
