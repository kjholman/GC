"use client";

import { useState } from "react";
import { removeDealDocumentAction } from "@/lib/deals/actions";
import { useConfirm } from "@/components/Confirm";

export function RemoveDocument({ id, filename }: { id: string; filename: string }) {
  const confirm = useConfirm();
  const [error, setError] = useState<string>();
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: `Remove ${filename}?`,
            body: (
              <>
                This file and everything in it will no longer be used in any analysis. Future analyses of this deal will start fresh, without
                reusing earlier memos or research that may have drawn on it. This can&apos;t be undone.
              </>
            ),
            confirmLabel: "Remove file",
            danger: true,
          });
          if (!ok) return;
          const res = await removeDealDocumentAction(id);
          setError(res.ok ? undefined : res.error);
        }}
        className="shrink-0 text-[11.5px] text-neg hover:underline"
      >
        Remove
      </button>
      {error && <span className="block text-[11.5px] text-neg">{error}</span>}
    </>
  );
}
