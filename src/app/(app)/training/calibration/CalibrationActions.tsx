"use client";

import { useState } from "react";
import { generateSuggestionsAction, resolveSuggestionAction, type TrainState } from "@/lib/training/actions";
import { Button, cx } from "@/components/ui";

export function GenerateSuggestions({ disabled }: { disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<TrainState>({ ok: false });
  return (
    <div>
      <Button
        variant="secondary"
        className="w-full"
        disabled={disabled || pending}
        onClick={async () => {
          setPending(true);
          setState(await generateSuggestionsAction());
          setPending(false);
        }}
      >
        {pending ? "Reading the feedback…" : disabled ? "Needs at least 3 reviews" : "Find patterns and suggest principles"}
      </Button>
      {(state.error || state.message) && <p className={cx("mt-2 text-[12.5px]", state.error ? "text-neg" : "text-pos")}>{state.error ?? state.message}</p>}
    </div>
  );
}

export function SuggestionActions({ id }: { id: string }) {
  return (
    <div className="mt-3 flex gap-3 text-[12.5px]">
      <button onClick={() => resolveSuggestionAction(id, true)} className="font-medium text-pos hover:underline">Adopt as principle</button>
      <button onClick={() => resolveSuggestionAction(id, false)} className="text-muted hover:underline">Dismiss</button>
    </div>
  );
}
