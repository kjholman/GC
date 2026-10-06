"use client";

import { useActionState, useState } from "react";
import type { Role } from "@prisma/client";
import { addUsersAction, createSignInLinkAction, setUserActiveAction, updateUserAction, type AdminState } from "@/lib/admin/actions";
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
        {user.active && <SignInLinkButton userId={user.id} email={user.email} />}
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

function SignInLinkButton({ userId, email }: { userId: string; email: string }) {
  const [link, setLink] = useState<{ url: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <span className="mr-4 inline-block">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await createSignInLinkAction(userId);
          setBusy(false);
          if (r.ok && r.url) {
            setLink({ url: r.url, expires: r.expires! });
            setCopied(false);
          } else alert(r.error ?? "Could not create a link.");
        }}
        className="text-[12.5px] text-navy-700 hover:underline"
      >
        {busy ? "Creating…" : "Sign-in link"}
      </button>
      {link && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy-950/40 p-6" onClick={(e) => e.target === e.currentTarget && setLink(null)}>
          <div className="w-full max-w-lg rounded-[3px] border border-line bg-paper p-6 text-left shadow-[var(--shadow-lift)]">
            <div className="eyebrow mb-1 text-gold-600">Single-use sign-in link</div>
            <h3 className="font-serif text-[20px] text-navy-900">{email}</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              Send this to the user by any channel (Teams, text, your own email). It works once and expires {link.expires}. Creating a new link cancels this one.
            </p>
            <div className="mt-4 rounded-[3px] border border-line bg-ivory px-3 py-2 font-mono text-[11.5px] text-ink [overflow-wrap:anywhere]">{link.url}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setLink(null)} className="rounded-[3px] px-4 py-2 text-[13px] text-muted hover:text-ink">Close</button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                }}
                className="rounded-[3px] bg-navy-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-navy-800"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
