import Link from "next/link";
import { Meme } from "@/components/Meme";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-mist px-4 text-center">
      <Meme kind="NOT_FOUND" size={280} />
      <div>
        <h1 className="font-display text-[26px] font-semibold text-navy-900">Page not found</h1>
        <p className="mt-1 text-[14px] text-muted">The link may be old, or the deal may have been removed.</p>
      </div>
      <Link href="/" className="rounded-lg bg-navy-900 px-4 py-2.5 text-[13.5px] font-medium text-white hover:bg-brand-700">Back to the overview</Link>
    </main>
  );
}
