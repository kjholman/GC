import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { DnaHelix } from "@/components/DnaHelix";
import { env } from "@/lib/env";
import { adminBypassAction } from "@/lib/auth/actions";
import { emailDeliveryConfigured } from "@/lib/mailer";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  const emailEnabled = emailDeliveryConfigured();
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex items-center justify-between px-6 py-4 lg:px-8">
        <Logo />
        <span className="hidden text-[13px] text-ink-soft sm:block">Analyst Platform · Authorised personnel only</span>
      </header>

      <div className="relative mx-4 mb-4 flex flex-1 overflow-hidden rounded-2xl lg:mx-4">
        <DnaHelix className="absolute inset-0 h-full w-full" />
        <div className="relative grid w-full items-center gap-10 px-8 py-14 lg:grid-cols-[1.15fr_440px] lg:px-14">
          <div className="max-w-2xl text-white">
            <div className="mb-5 text-[12px] font-medium uppercase tracking-[0.22em] text-brand-300">Genesys Capital · Analyst Platform</div>
            <h1 className="font-display font-semibold text-[46px] font-semibold leading-[1.08] tracking-[-0.015em] lg:text-[58px]">
              Catalysts for Medical Breakthroughs
            </h1>
            <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-white/75">
              Scientific and financial underwriting for life sciences ventures, informed by more than 25 years of Genesys Capital investment experience.
            </p>
          </div>

          <div className="w-full rounded-2xl bg-paper p-8 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)]">
          {sp.link === "invalid" && (
            <p className="mb-6 rounded-lg border border-[#efd2ce] bg-neg-bg px-4 py-3 text-[13px] text-neg">
              That sign-in link has expired or was already used. Ask an administrator for a new one.
            </p>
          )}
          {emailEnabled ? (
            <LoginForm />
          ) : (
            <div>
              <div className="eyebrow mb-2 !text-brand-600">Secure sign-in</div>
              <h2 className="font-display font-semibold text-[30px] font-semibold leading-tight text-ink">Sign in with your link</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
                Access is by personal sign-in link. Ask a platform administrator to send you one. Each link works once and expires after 24 hours; your session then lasts several days.
              </p>
            </div>
          )}
          {env.adminBypassEnabled && (
            <form action={adminBypassAction} className="mt-8 rounded-lg border border-dashed border-[#e3c3be] bg-neg-bg/60 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neg">Testing only</div>
              <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-ink-soft">
                Sign-in bypass is enabled for this environment. Disable it before uploading confidential materials.
              </p>
              <button className="w-full rounded-lg border border-neg bg-paper px-4 py-2.5 text-[13.5px] font-medium text-neg hover:bg-neg-bg">
                Continue as administrator
              </button>
            </form>
          )}
          <p className="mt-8 text-[11.5px] leading-relaxed text-muted">
            Access is restricted to authorised Genesys Capital personnel. All activity, including sign-in attempts, is
            recorded. Need access? Contact your platform administrator.
          </p>
          </div>
        </div>
      </div>
    </div>
  );
}
