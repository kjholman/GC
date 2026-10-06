"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { cx } from "./ui";

type Options = {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for removals and other destructive actions. */
  danger?: boolean;
};

const Ctx = createContext<(o: Options) => Promise<boolean>>(async () => false);

/** `const confirm = useConfirm(); if (await confirm({ title: "Remove?" })) …` shows the in-app pop-up. */
export const useConfirm = () => useContext(Ctx);

/**
 * onSubmit handler for a form that asks first: `<form action={action} onSubmit={useConfirmSubmit({...})}>`.
 * Pass `null` options (e.g. when nothing is being changed) to submit without asking.
 */
export function useConfirmSubmit(options: Options | null) {
  const confirm = useConfirm();
  const approved = useRef(false);
  return async (e: React.FormEvent<HTMLFormElement>) => {
    if (!options || approved.current) {
      approved.current = false;
      return;
    }
    e.preventDefault();
    const form = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (await confirm(options)) {
      approved.current = true;
      form.requestSubmit(submitter ?? undefined);
    }
  };
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<(Options & { resolve: (v: boolean) => void }) | null>(null);
  const confirmBtn = useRef<HTMLButtonElement>(null);

  const ask = useCallback((o: Options) => new Promise<boolean>((resolve) => setOpen({ ...o, resolve })), []);
  const close = useCallback((v: boolean) => {
    setOpen((cur) => {
      cur?.resolve(v);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    confirmBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <Ctx.Provider value={ask}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <button aria-label="Cancel" onClick={() => close(false)} className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" />
          <div className="relative w-full max-w-md rounded-2xl bg-paper p-6 shadow-[0_30px_60px_-20px_rgba(4,29,42,0.45)]">
            <h2 id="confirm-title" className="font-display text-[19px] font-semibold text-navy-900">{open.title}</h2>
            {open.body && <div className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">{open.body}</div>}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => close(false)} className="rounded-lg border border-line-strong bg-paper px-4 py-2.5 text-[13.5px] font-medium text-ink hover:bg-mist">
                {open.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmBtn}
                onClick={() => close(true)}
                className={cx(
                  "rounded-lg px-4 py-2.5 text-[13.5px] font-medium text-white",
                  open.danger ? "bg-neg hover:opacity-90" : "bg-navy-900 hover:bg-brand-700",
                )}
              >
                {open.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
