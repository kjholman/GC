"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import { addUsersAction, type AdminState } from "@/lib/admin/actions";
import { Button, Card, Field, cx, inputCls } from "@/components/ui";

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

export function UserRow({ user }: { user: RowUser }) {
  return (
    <tr className={cx(!user.active && "opacity-50")}>
      <td className="py-3 pr-4 pl-6">
        <div className="font-medium text-navy-900">{user.name ?? user.email.split("@")[0]}</div>
        <div className="text-[12.5px] text-muted">{[user.title, user.email].filter(Boolean).join(" · ")}</div>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-muted" title={user.lastActiveHint}>{user.lastActive}</td>
    </tr>
  );
}
