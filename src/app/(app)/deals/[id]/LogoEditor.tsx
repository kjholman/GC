"use client";

import { useRef, useState } from "react";
import { findLogoNowAction, setLogoAction } from "@/lib/deals/actions";
import { useConfirm } from "@/components/Confirm";

/** Small "Change logo" control for when the automatic logo is wrong or missing. */
export function LogoEditor({ dealId, hasLogo, note }: { dealId: string; hasLogo: boolean; note?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [why, setWhy] = useState<string | null | undefined>(note);
  const confirm = useConfirm();
  const submit = async (file: File | null) => {
    setPending(true);
    const fd = new FormData();
    if (file) fd.set("logo", file);
    const res = await setLogoAction(dealId, fd);
    setError(res.ok ? undefined : res.error);
    setPending(false);
  };
  return (
    <span className="no-print text-[12px] text-muted">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" className="hidden" onChange={(e) => submit(e.target.files?.[0] ?? null)} />
      <button type="button" disabled={pending} onClick={() => input.current?.click()} className="hover:text-navy-800 hover:underline">
        {pending ? "Saving…" : hasLogo ? "Change logo" : "Add logo"}
      </button>
      {!hasLogo && (
        <>
          {" · "}
          <button
            type="button"
            disabled={searching}
            onClick={async () => {
              setSearching(true);
              const res = await findLogoNowAction(dealId);
              setWhy(res.ok ? null : (res.note ?? res.error));
              setSearching(false);
            }}
            className="hover:text-navy-800 hover:underline"
          >
            {searching ? "Searching the website and deck…" : "Find logo"}
          </button>
          {why && !searching && <span className="mt-0.5 block max-w-xl text-[11.5px] leading-snug text-muted">Not found automatically: {why}. Use Add logo to upload it.</span>}
        </>
      )}
      {hasLogo && !pending && (
        <>
          {" · "}
          <button type="button" onClick={async () => (await confirm({ title: "Remove this logo?", body: "The company's initials will show instead. You can add a logo again at any time.", confirmLabel: "Remove logo", danger: true })) && submit(null)} className="hover:text-neg hover:underline">Remove</button>
        </>
      )}
      {error && <span className="ml-2 text-neg">{error}</span>}
    </span>
  );
}
