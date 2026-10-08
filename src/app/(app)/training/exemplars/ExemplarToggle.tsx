"use client";

import { toggleExemplarAction } from "@/lib/training/actions";
import { useConfirm } from "@/components/Confirm";

export function ExemplarToggle({ id, active }: { id: string; active: boolean }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => {
        const ok = await confirm(
          active
            ? { title: "Stop using this example memo?", body: "GAIA will no longer study it for similar deals. You can use it again later.", confirmLabel: "Stop using", danger: true }
            : { title: "Use this example memo again?", confirmLabel: "Use again" },
        );
        if (ok) await toggleExemplarAction(id, !active);
      }} className="text-navy-700 hover:underline">
      {active ? "Stop using" : "Use again"}
    </button>
  );
}
