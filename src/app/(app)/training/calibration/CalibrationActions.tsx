"use client";

import { useState } from "react";
import { generateSuggestionsAction, resolveSuggestionAction, type TrainState } from "@/lib/training/actions";
import { Button, cx } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";

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
  const confirm = useConfirm();
  return (
    <div className="mt-3 flex gap-3 text-[12.5px]">
      <button
        onClick={async () => {
          if (await confirm({ title: "Adopt this as a principle?", body: "It will be added to the knowledge base and applied to every analysis from now on.", confirmLabel: "Adopt" }))
            await resolveSuggestionAction(id, true);
        }} className="font-medium text-pos hover:underline">Adopt as principle</button>
      <button
        onClick={async () => {
          if (await confirm({ title: "Dismiss this suggestion?", confirmLabel: "Dismiss", danger: true })) await resolveSuggestionAction(id, false);
        }} className="text-muted hover:underline">Dismiss</button>
    </div>
  );
}
