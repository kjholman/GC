"use client";

import { toggleExemplarAction } from "@/lib/training/actions";

export function ExemplarToggle({ id, active }: { id: string; active: boolean }) {
  return (
    <button onClick={() => toggleExemplarAction(id, !active)} className="text-navy-700 hover:underline">
      {active ? "Retire" : "Reinstate"}
    </button>
  );
}
