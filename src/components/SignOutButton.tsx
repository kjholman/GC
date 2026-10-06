"use client";

import { signOutAction } from "@/lib/auth/actions";
import { useConfirm } from "./Confirm";

export function SignOutButton() {
  const confirm = useConfirm();
  return (
    <button
      onClick={async () => {
        if (await confirm({ title: "Sign out?", body: "Any analysis that is running carries on without you.", confirmLabel: "Sign out" })) await signOutAction();
      }}
      className="text-[12px] text-white/45 transition-colors hover:text-white"
    >
      Sign out
    </button>
  );
}
