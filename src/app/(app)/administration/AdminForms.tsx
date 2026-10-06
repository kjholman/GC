"use client";

import { useActionState, useState } from "react";
import type { Role } from "@prisma/client";
import { addUsersAction, createSignInLinkAction, setUserActiveAction, updateUserAction, type AdminState } from "@/lib/admin/actions";
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

type RowUser = { id: string; email: string; name: string | null; title: string | null; role: Role; active: boolean; lastLoginAt: string };

export function UserRow({ user, isSelf }: { user: RowUser; isSelf: boolean }) {
  const confirm = useConfirm();
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
      <td className="px-4 py-3 text-[12.5px] text-muted">{user.lastLoginAt}</td>
      <td className="py-3 pr-6 pl-4 text-right">
        {user.active && <SignInLinkButton userId={user.id} email={user.email} />}
        {!isSelf && (
          <button
            onClick={async () => {
              const ok = await confirm(
                user.active
                  ? { title: `Remove access for ${user.email}?`, body: "They will be signed out straight away and can't sign in again until access is restored.", confirmLabel: "Remove access", danger: true }
                  : { title: `Restore access for ${user.email}?`, confirmLabel: "Restore access" },
              );
              if (!ok) return;
              await setUserActiveAction(user.id, !user.active);
            }}
            className={cx("text-[12.5px] hover:underline", user.active ? "text-neg" : "text-pos")}
          >
            {user.active ? "Remove access" : "Restore access"}
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
        {busy ? "Creating…" : "Get sign-in link"}
      </button>
      {link && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy-950/40 p-6" onClick={(e) => e.target === e.currentTarget && setLink(null)}>
          <div className="w-full max-w-lg rounded-lg border border-line bg-paper p-6 text-left shadow-[var(--shadow-lift)]">
            <div className="eyebrow mb-1 !text-brand-600">Sign-in link</div>
            <h3 className="font-display font-semibold text-[20px] text-navy-900">{email}</h3>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              Copy this link and send it to them however you like (Teams, text or your own email). It works once and expires {link.expires}. If you create another link, this one stops working.
            </p>
            <div className="mt-4 rounded-lg border border-line bg-mist px-3 py-2 font-mono text-[11.5px] text-ink [overflow-wrap:anywhere]">{link.url}</div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setLink(null)} className="rounded-lg px-4 py-2 text-[13px] text-muted hover:text-ink">Close</button>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(link.url);
                  setCopied(true);
                }}
                className="rounded-lg bg-navy-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-navy-800"
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
