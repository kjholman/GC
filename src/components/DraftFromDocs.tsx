"use client";

import { useState } from "react";
import Link from "next/link";
import { draftFromDocumentsAction } from "@/lib/knowledge/actions";
import { Button, cx } from "./ui";

/** "Draft from our documents": GAIA proposes firm settings and principles from the uploaded firm documents. */
export function DraftFromDocs({ label = "Draft from our documents" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await draftFromDocumentsAction();
          setRes({ ok: r.ok, text: r.message ?? r.error ?? "" });
          setBusy(false);
        }}
      >
        {busy ? "Reading your documents…" : label}
      </Button>
      {res && (
        <span className={cx("text-[12.5px]", res.ok ? "text-pos" : "text-neg")}>
          {res.text} {res.ok && <Link href="/knowledge" className="underline">Open suggestions</Link>}
        </span>
      )}
    </div>
  );
}
