"use client";

import { useRef, useState } from "react";
import { cx } from "./ui";

const ACCEPT = ".pdf,.pptx,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp";

function fmtSize(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Multi-file drop target that keeps a real <input type="file"> in sync for form submission. */
export function Dropzone({ name = "files", prompt, compact = false, onFilesChange }: { name?: string; prompt: string; compact?: boolean; onFilesChange?: (count: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);

  const sync = (next: File[]) => {
    setFiles(next);
    onFilesChange?.(next.length);
    const dt = new DataTransfer();
    next.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          sync([...files, ...Array.from(e.dataTransfer.files)]);
        }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed text-center transition-colors",
          compact ? "px-6 py-7" : "px-8 py-14",
          over ? "border-brand-500 bg-brand-100/60" : "border-line-strong bg-mist/60 hover:border-navy-700 hover:bg-navy-50/60",
        )}
      >
        <svg viewBox="0 0 24 24" className="mb-3 h-8 w-8 text-brand-500" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
          <path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3" />
        </svg>
        <div className="font-display font-semibold text-[18px] text-navy-900">{prompt}</div>
        <div className="mt-1.5 text-[12.5px] text-muted">
          Drag and drop several files at once, or <span className="text-navy-700 underline underline-offset-2">browse</span> · PDF preferred for decks · PPTX, DOCX, XLSX, CSV, images · up to 500 MB each
        </div>
        <input
          ref={inputRef}
          type="file"
          name={name}
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => sync([...files, ...Array.from(e.target.files ?? [])])}
        />
      </div>
      {files.length > 1 && (
        <div className="mt-3 text-[12px] text-muted">
          {files.length} files · {fmtSize(files.reduce((a, f) => a + f.size, 0))} total
        </div>
      )}
      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-paper">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
              <span className="rounded-md bg-navy-50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-navy-700">
                {f.name.split(".").pop()}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
              <span className={cx("tabular text-[12px]", f.size > 500 * 1024 * 1024 ? "text-neg" : "text-muted")}>{fmtSize(f.size)}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); sync(files.filter((_, k) => k !== i)); }}
                className="text-muted hover:text-neg"
                aria-label={`Remove ${f.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
