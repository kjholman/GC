import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Logo } from "@/components/Logo";
import { DnaHelix } from "@/components/DnaHelix";
import { env } from "@/lib/env";
import { adminBypassAction } from "@/lib/auth/actions";
import { LoginForm, type LoginPerson } from "./LoginForm";
import { TEAM } from "@/lib/team";
import fs from "node:fs";
import path from "node:path";

/** public/team/<id>.jpg, .png or .webp if it has been added. */
function teamPhoto(id: string): string | null {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    try {
      if (fs.existsSync(path.join(process.cwd(), "public", "team", `${id}.${ext}`))) return `/team/${id}.${ext}`;
    } catch {}
  }
  return null;
}


export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const sp = await searchParams;
  const people: LoginPerson[] = TEAM.map((m) => ({ id: m.id, name: m.name, fullName: m.fullName, title: m.title, enabled: !!m.email, photo: teamPhoto(m.id) }));
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Logo />
      </header>

      <div className="relative mx-4 mb-4 flex flex-1 overflow-hidden rounded-2xl lg:mx-4">
        <DnaHelix className="absolute inset-0 h-full w-full" />
        <div className="relative flex w-full items-center justify-center px-5 py-10 sm:px-8 sm:py-14">
          <div className="w-full max-w-[460px] rounded-2xl bg-paper p-6 sm:p-8 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)]">
          {sp.link === "invalid" && (
            <p className="mb-6 rounded-lg border border-[#efd2ce] bg-neg-bg px-4 py-3 text-[13px] text-neg">
              That sign-in link has expired or was already used. Request a new code below.
            </p>
          )}
          <LoginForm people={people} />
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
          </div>
        </div>
      </div>
    </div>
  );
}
