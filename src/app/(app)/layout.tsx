import { requireUser, hasRole } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { SignOutButton } from "@/components/SignOutButton";
import { GenesysMark, Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { MobileNav } from "@/components/MobileNav";
import { getAiStatus, recheckCreditIfFlagged } from "@/lib/ai/credit";
import { resumeAllPaused } from "@/lib/deals/scheduler";
import { after } from "next/server";
import { CreditBanner } from "@/components/CreditBanner";
import { SharminatorEasterEgg } from "@/components/SharminatorEasterEgg";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const items = [
    { href: "/", label: "Overview", icon: "overview" },
    { href: "/deals", label: "Deal pipeline", icon: "pipeline" },
    { href: "/deals/new", label: "New screening", icon: "new" },
    { href: "/knowledge", label: "Knowledge base", icon: "knowledge" },
    { href: "/training", label: "Training Studio", icon: "training" },
    ...(hasRole(user.role, "ADMIN") ? [{ href: "/administration", label: "Administration", icon: "admin" }] : []),
  ];
  const ai = await getAiStatus().catch(() => null);
  // Out of credit: re-check in the background so the notice clears by itself once credit is added.
  if (ai?.creditLowSince) after(() => recheckCreditIfFlagged(resumeAllPaused).catch(() => {}));
  const initials = (user.name ?? user.email)
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const account = (
    <>
          <div className="flex items-center gap-3">
            <div className="hex bg-brand-gradient flex h-10 w-10 items-center justify-center font-display font-semibold text-[13px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-white">{user.name ?? user.email.split("@")[0]}</div>
              <div className="truncate text-[11px] text-white/45">{user.title ?? ({ ANALYST: "Analyst", PARTNER: "Partner", ADMIN: "Administrator" } as Record<string, string>)[user.role] ?? user.role}</div>
            </div>
          </div>
          <div className="mt-4"><SignOutButton /></div>
    </>
  );

  return (
    <div className="min-h-screen lg:flex">
      <MobileNav items={items} footer={account} />
      <aside className="no-print sticky top-0 hidden h-screen w-[252px] lg:flex shrink-0 flex-col overflow-hidden bg-navy-900 text-white">
        {/* Oversized faded mark, as on the website's navy sections. */}
        <GenesysMark size={420} className="pointer-events-none absolute -right-28 bottom-16 opacity-[0.09]" />
        <div className="relative px-6 pt-7 pb-8">
          <Logo on="dark" />
          <div className="mt-4 text-[10.5px] font-medium uppercase tracking-[0.22em] text-brand-300/80">The Sharminator</div>
        </div>
        <div className="relative"><Nav items={items} /></div>
        <div className="relative mt-auto border-t border-white/10 px-5 py-5">{account}</div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8 lg:px-10 lg:py-10 xl:px-14">
        {env.adminBypassEnabled && (
          <div className="no-print mx-auto mb-6 max-w-[1280px] rounded-lg border border-[#e3c3be] bg-neg-bg px-4 py-2 text-[12.5px] text-neg">
            Testing mode: anyone with this web address can get in without signing in. Ask your developer to switch this off before uploading confidential material.
          </div>
        )}
        <CreditBanner initialLow={!!ai?.creditLowSince} isAdmin={hasRole(user.role, "ADMIN")} />
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
      <SharminatorEasterEgg />
    </div>
  );
}
