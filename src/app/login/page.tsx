import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-950 px-14 py-12 text-white lg:flex lg:flex-col">
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
          <defs>
            <pattern id="grid" width="56" height="56" patternUnits="userSpaceOnUse">
              <path d="M56 0H0V56" fill="none" stroke="white" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
        <div className="pointer-events-none absolute -right-40 -bottom-40 h-[520px] w-[520px] rounded-full border border-gold-500/25" />
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-[360px] w-[360px] rounded-full border border-gold-500/20" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative mt-auto max-w-lg">
          <div className="eyebrow mb-5 !text-gold-300">Investment Analyst Platform</div>
          <h1 className="font-serif text-[44px] leading-[1.08] tracking-[-0.01em]">
            Rigorous conviction, <em className="text-gold-300">from first deck</em> to Investment Committee.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/65">
            Scientific and financial underwriting for Canada&apos;s life sciences ventures, calibrated to two decades of
            Genesys Capital investment history.
          </p>
        </div>
        <div className="relative mt-16 flex items-center justify-between border-t border-white/10 pt-6 text-[11.5px] tracking-wide text-white/40">
          <span>Toronto · Since 2000</span>
          <span>Confidential. Authorised personnel only</span>
        </div>
      </div>

      <div className="flex items-center justify-center bg-ivory px-6 py-16">
        <div className="w-full max-w-[400px]">
          <div className="mb-10 lg:hidden">
            <Logo tone="dark" />
          </div>
          <LoginForm />
          <p className="mt-12 text-[11.5px] leading-relaxed text-muted">
            Access is restricted to authorised Genesys Capital personnel. All activity, including sign-in attempts, is
            recorded. Need access? Contact your platform administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
