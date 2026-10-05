import { requireUser, hasRole } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const items = [
    { href: "/", label: "Overview", icon: "overview" },
    { href: "/deals", label: "Deal pipeline", icon: "pipeline" },
    { href: "/deals/new", label: "New screening", icon: "new" },
    { href: "/knowledge", label: "Knowledge base", icon: "knowledge" },
    ...(hasRole(user.role, "ADMIN") ? [{ href: "/admin", label: "Administration", icon: "admin" }] : []),
  ];
  const initials = (user.name ?? user.email)
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col bg-navy-950 text-white">
        <div className="px-6 pt-7 pb-8">
          <Logo />
          <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35">Analyst Platform</div>
        </div>
        <Nav items={items} />
        <div className="mt-auto border-t border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-500/50 font-serif text-[13px] text-gold-300">
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
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
