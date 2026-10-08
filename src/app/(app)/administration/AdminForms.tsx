"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import { addUsersAction, setUserActiveAction, type AdminState } from "@/lib/admin/actions";
import { Button, Card, Field, cx, inputCls } from "@/components/ui";
import { useConfirm } from "@/components/Confirm";

export function AddUsersForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(addUsersAction, { ok: false });
  return (
    <Card>
      <div className="eyebrow mb-1 !text-brand-600">Add people</div>
      <h3 className="mb-5 font-display font-semibold text-[20px] text-navy-900">Give someone access</h3>
      <form action={action} className="space-y-4">
        <Field label="Their Genesys Capital email" hint="You can add several at once: one per line, or separated by commas.">
          <textarea name="emails" rows={5} placeholder={"jane.doe@genesyscapital.com\njohn.smith@genesyscapital.com"} className={inputCls} />
        </Field>
        {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
        {state.message && <p className="text-[13px] text-pos">{state.message}</p>}
        <Button type="submit" disabled={pending} className="w-full">Give access</Button>
      </form>
    </Card>
  );
}

type RowUser = { id: string; email: string; name: string | null; title: string | null; role: Role; active: boolean; lastActive: string; lastActiveHint: string };

export function UserRow({ user, isSelf }: { user: RowUser; isSelf: boolean }) {
  const confirm = useConfirm();
  return (
    <tr className={cx(!user.active && "opacity-50")}>
      <td className="py-3 pr-4 pl-6">
        <div className="font-medium text-navy-900">{user.name ?? user.email.split("@")[0]}</div>
        <div className="text-[12.5px] text-muted">{[user.title, user.email].filter(Boolean).join(" · ")}</div>
      </td>
      <td className="px-4 py-3">
        {isSelf ? (
          <span className="text-[12.5px] text-pos">Active (you)</span>
        ) : (
          <select
            aria-label={`Status for ${user.email}`}
            value={user.active ? "active" : "off"}
            onChange={async (e) => {
              const active = e.target.value === "active";
              const ok = await confirm(
                active
                  ? { title: `Give ${user.email} access again?`, body: "They will be able to sign in with an emailed code.", confirmLabel: "Set to active" }
                  : { title: `Turn off access for ${user.email}?`, body: "They are signed out straight away and can't sign in until set back to active.", confirmLabel: "Turn off access", danger: true },
              );
              if (ok) await setUserActiveAction(user.id, active);
            }}
            className={cx("h-8 rounded-lg border border-line-strong bg-paper px-2 text-[12.5px]", user.active ? "text-pos" : "text-neg")}
          >
            <option value="active">Active</option>
            <option value="off">No access</option>
          </select>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-muted" title={user.lastActiveHint}>{user.lastActive}</td>
    </tr>
  );
}
