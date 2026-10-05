"use client";

import { useActionState } from "react";
import type { Role } from "@prisma/client";
import { addUsersAction, setUserActiveAction, updateUserAction, type AdminState } from "@/lib/admin/actions";
import { Button, Card, Field, cx, inputCls } from "@/components/ui";

export function AddUsersForm() {
  const [state, action, pending] = useActionState<AdminState, FormData>(addUsersAction, { ok: false });
  return (
    <Card>
      <div className="eyebrow mb-1 text-gold-600">Grant access</div>
      <h3 className="mb-5 font-serif text-[20px] text-navy-900">Authorise users</h3>
      <form action={action} className="space-y-4">
        <Field label="Email addresses" hint="One per line, or comma-separated.">
          <textarea name="emails" rows={5} placeholder={"jane.doe@genesyscapital.com\njohn.smith@genesyscapital.com"} className={inputCls} />
        </Field>
        <Field label="Role">
          <select name="role" className={inputCls} defaultValue="ANALYST">
            <option value="ANALYST">Analyst: screen and analyse deals</option>
            <option value="PARTNER">Partner: also IC decisions and knowledge base</option>
            <option value="ADMIN">Administrator: also user management</option>
          </select>
        </Field>
        {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
        {state.message && <p className="text-[13px] text-pos">{state.message}</p>}
        <Button type="submit" disabled={pending} className="w-full">Authorise</Button>
      </form>
    </Card>
  );
}

type RowUser = { id: string; email: string; name: string | null; title: string | null; role: Role; active: boolean; lastLoginAt: string };

export function UserRow({ user, isSelf }: { user: RowUser; isSelf: boolean }) {
  return (
    <tr className={cx(!user.active && "opacity-50")}>
      <td className="py-3 pr-4 pl-6">
        <form action={updateUserAction.bind(null, user.id)} className="flex flex-col gap-1">
          <div className="font-medium text-navy-900">{user.email}</div>
          <div className="flex gap-2">
            <input name="name" defaultValue={user.name ?? ""} placeholder="Name" className="w-36 border-b border-transparent bg-transparent text-[12.5px] text-ink-soft hover:border-line focus:border-navy-700 focus:outline-none" />
            <input name="title" defaultValue={user.title ?? ""} placeholder="Title" className="w-40 border-b border-transparent bg-transparent text-[12.5px] text-ink-soft hover:border-line focus:border-navy-700 focus:outline-none" />
            <button className="text-[11.5px] text-navy-700 hover:underline">Save</button>
          </div>
        </form>
      </td>
      <td className="px-4 py-3">
        <form action={updateUserAction.bind(null, user.id)}>
          <select
            name="role"
            defaultValue={user.role}
            disabled={isSelf}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="rounded-[3px] border border-line bg-paper px-2 py-1 text-[12.5px]"
          >
            <option value="ANALYST">Analyst</option>
            <option value="PARTNER">Partner</option>
            <option value="ADMIN">Admin</option>
          </select>
        </form>
      </td>
      <td className="px-4 py-3 text-[12.5px] text-muted">{user.lastLoginAt}</td>
      <td className="py-3 pr-6 pl-4 text-right">
        {!isSelf && (
          <button
            onClick={async () => {
              if (user.active && !confirm(`Revoke access for ${user.email}? Their sessions end immediately.`)) return;
              await setUserActiveAction(user.id, !user.active);
            }}
            className={cx("text-[12.5px] hover:underline", user.active ? "text-neg" : "text-pos")}
          >
            {user.active ? "Revoke" : "Restore"}
          </button>
        )}
      </td>
    </tr>
  );
}
