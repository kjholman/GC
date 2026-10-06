import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/crypto";
import { redeemSignInLinkAction } from "@/lib/auth/actions";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";


/** Landing page for administrator-issued sign-in links. Signing in needs a click,
 *  so link previews in Teams or Outlook cannot use up the link. */
export default async function SignInLinkPage({ searchParams }: PageProps<"/login/link">) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const link = token
    ? await db.signInLink.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { email: true, active: true } } } })
    : null;
  const valid = !!link && !link.usedAt && link.expiresAt > new Date() && link.user.active;

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist px-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-10"><Logo /></div>
        {valid ? (
          <form action={redeemSignInLinkAction.bind(null, token)} className="space-y-6">
            <div>
              <div className="eyebrow mb-2 text-brand-600">Secure sign-in</div>
              <h1 className="font-display font-semibold text-[30px] leading-tight text-navy-900">Continue to the Sharminator</h1>
              <p className="mt-2 text-[14px] text-ink-soft">
                Signing in as <span className="font-medium text-ink">{link!.user.email}</span>. This link works once.
              </p>
            </div>
            <Button type="submit" className="w-full py-3">Sign in</Button>
          </form>
        ) : (
          <div>
            <h1 className="font-display font-semibold text-[28px] leading-tight text-navy-900">This sign-in link is no longer valid</h1>
            <p className="mt-3 text-[14px] text-ink-soft">
              Links work once and expire after 24 hours. Ask a platform administrator for a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
