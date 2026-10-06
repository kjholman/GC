import { requireUser, hasRole } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { signOutAction } from "@/lib/auth/actions";
import { GenesysMark, Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const items = [
    { href: "/", label: "Overview", icon: "overview" },
    { href: "/deals", label: "Deal pipeline", icon: "pipeline" },
    { href: "/deals/new", label: "New screening", icon: "new" },
    { href: "/knowledge", label: "Knowledge base", icon: "knowledge" },
    { href: "/training", label: "Training Studio", icon: "training" },
    ...(hasRole(user.role, "ADMIN") ? [{ href: "/admin", label: "Administration", icon: "admin" }] : []),
  ];
  const initials = (user.name ?? user.email)
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[252px] shrink-0 flex-col overflow-hidden bg-navy-900 text-white">
        {/* Oversized faded mark, as on the website's navy sections. */}
        <GenesysMark size={420} className="pointer-events-none absolute -right-28 bottom-16 opacity-[0.09]" />
        <div className="relative px-6 pt-7 pb-8">
          <Logo on="dark" />
          <div className="mt-4 text-[10.5px] font-medium uppercase tracking-[0.22em] text-brand-300/80">Analyst Platform</div>
        </div>
        <div className="relative"><Nav items={items} /></div>
        <div className="relative mt-auto border-t border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="hex bg-brand-gradient flex h-10 w-10 items-center justify-center font-display font-semibold text-[13px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-white">{user.name ?? user.email.split("@")[0]}</div>
              <div className="truncate text-[11px] text-white/45">{user.title ?? user.role.toLowerCase()}</div>
            </div>
          </div>
          <form action={signOutAction} className="mt-4">
            <button className="text-[12px] text-white/45 transition-colors hover:text-white">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-10 xl:px-14">
        {env.adminBypassEnabled && (
          <div className="no-print mx-auto mb-6 max-w-[1280px] rounded-lg border border-[#e3c3be] bg-neg-bg px-4 py-2 text-[12.5px] text-neg">
            Testing mode: the sign-in bypass is on. Anyone with this link can enter as an administrator. Set ENABLE_ADMIN_BYPASS=false before real use.
          </div>
        )}
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
