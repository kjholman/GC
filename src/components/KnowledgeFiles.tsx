"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteKnowledgeFileAction, finishKnowledgeUploadAction, retryKnowledgeFileAction, type UploadState } from "@/lib/knowledge/actions";
import { useConfirm } from "./Confirm";
import { Button, cx } from "./ui";
import { usePaged } from "./Pager";

export type KFile = { id: string; filename: string; size: string; status: string; summary: string | null };

const fmt = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const STATUS: Record<string, { label: string; cls: string }> = {
  UPLOADING: { label: "Uploading…", cls: "text-brand-600" },
  READING: { label: "Reading…", cls: "text-brand-600" },
  READY: { label: "Read", cls: "text-pos" },
  STORED: { label: "Kept for reference", cls: "text-muted" },
  FAILED: { label: "Couldn't read", cls: "text-neg" },
};

/** Upload any number of files of any type and size, plus the list of what's attached. */
export function KnowledgeFiles({ scope, targetId, files, canEdit, compact = false, hint }: {
  scope: "FIRM" | "PORTFOLIO" | "PAST_DEAL"; targetId?: string | null; files: KFile[]; canEdit: boolean; compact?: boolean; hint?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ ok: false });
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number; n: number; of: number } | null>(null);
  const [picked, setPicked] = useState<File[]>([]);

  /** Streams one file to the server with progress; resolves to its id. */
  const send = (file: File, n: number, of: number) =>
    new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const qs = new URLSearchParams({ scope, name: file.name, ...(targetId ? { target: targetId } : {}) });
      xhr.open("PUT", `/api/knowledge-files/upload?${qs}`);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress({ name: file.name, pct: Math.round((e.loaded / e.total) * 100), n, of });
      xhr.onload = () => {
        const body = (() => { try { return JSON.parse(xhr.responseText); } catch { return {}; } })();
        if (xhr.status >= 200 && xhr.status < 300 && body.id) resolve(body.id);
        else reject(new Error(body.error ?? `${file.name} didn't upload.`));
      };
      xhr.onerror = () => reject(new Error(`${file.name} didn't upload. Check the connection and try again.`));
      xhr.send(file);
    });

  const upload = async () => {
    setPending(true);
    setState({ ok: false });
    const ids: string[] = [];
    try {
      for (const [i, f] of picked.entries()) ids.push(await send(f, i + 1, picked.length));
    } catch (err) {
      setState({ ok: false, error: (err as Error).message });
    }
    if (ids.length) {
      const res = await finishKnowledgeUploadAction({ scope, id: targetId ?? null }, ids);
      setState((s) => (s.error ? { ...res, ok: false, error: `${s.error} The others were uploaded.` } : res));
      setPicked([]);
      if (input.current) input.current.value = "";
      router.refresh();
      // Summaries are written in the background; show them when ready.
      for (const ms of [8000, 25000, 60000]) setTimeout(() => router.refresh(), ms);
    }
    setProgress(null);
    setPending(false);
  };
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const { shown: shownFiles, pager } = usePaged(files, 10);

  const setFiles = (list: FileList | null) => {
    if (!list || !input.current) return;
    const dt = new DataTransfer();
    for (const f of [...picked, ...Array.from(list)]) dt.items.add(f);
    input.current.files = dt.files;
    setPicked(Array.from(dt.files));
  };

  return (
    <div className="space-y-3">
      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {shownFiles.map((f) => (
            <li key={f.id} className="px-3 py-2.5 text-[13px]">
              <div className="flex items-center gap-3">
                <a href={`/api/knowledge-files/${f.id}`} className="min-w-0 flex-1 truncate text-navy-800 hover:underline" title={f.filename}>{f.filename}</a>
                <span className="shrink-0 text-[11.5px] tabular text-muted">{f.size}</span>
                <span className={cx("shrink-0 text-[11.5px]", STATUS[f.status]?.cls)}>{STATUS[f.status]?.label ?? f.status}</span>
                {canEdit && f.status === "FAILED" && (
                  <button onClick={() => retryKnowledgeFileAction(f.id)} className="shrink-0 text-[11.5px] text-navy-700 hover:underline">Try again</button>
                )}
                {canEdit && (
                  <button
                    onClick={async () => {
                      if (await confirm({ title: `Remove ${f.filename}?`, body: "It will no longer be used in analyses. The removal is recorded in the change history.", confirmLabel: "Remove", danger: true }))
                        await deleteKnowledgeFileAction(f.id);
                    }}
                    className="shrink-0 text-[11.5px] text-neg hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
              {f.summary && !compact && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[12px] text-muted">What GAIA took from it</summary>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{f.summary}</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
      {pager}
      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
          className="space-y-2"
        >
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); setFiles(e.dataTransfer.files); }}
            className={cx("block cursor-pointer rounded-lg border border-dashed px-4 text-center transition-colors", compact ? "py-3" : "py-5", drag ? "border-brand-500 bg-brand-100/50" : "border-line-strong hover:border-navy-700")}
          >
            <input ref={input} type="file" multiple className="sr-only" onChange={(e) => setFiles(e.target.files)} />
            <span className="text-[13px] font-medium text-navy-800">{picked.length ? `${picked.length} file${picked.length === 1 ? "" : "s"} selected (${fmt(picked.reduce((n, f) => n + f.size, 0))})` : "Drop files here or browse"}</span>
            <span className="mt-0.5 block text-[11.5px] text-muted">{hint ?? "Any number of files, any format, any size."}</span>
          </label>
          {progress && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11.5px] text-muted">
                <span className="truncate">Uploading {progress.name} ({progress.n} of {progress.of})</span>
                <span className="tabular">{progress.pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand-500 transition-all" style={{ width: `${progress.pct}%` }} /></div>
            </div>
          )}
          {picked.length > 0 && (
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Uploading…" : `Upload ${picked.length} file${picked.length === 1 ? "" : "s"}`}</Button>
          )}
          {state.error && <p className="text-[12.5px] text-neg">{state.error}</p>}
          {state.ok && state.message && <p className="text-[12.5px] text-pos">{state.message}</p>}
        </form>
      )}
    </div>
  );
}
