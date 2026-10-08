"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * The "out of credit" notice. It checks the live status (every 20 seconds while
 * shown, every 2 minutes otherwise) so it disappears by itself once credit is
 * added, and appears without a reload if credit runs out.
 */
export function CreditBanner({ initialLow, isAdmin }: { initialLow: boolean; isAdmin: boolean }) {
  const [low, setLow] = useState(initialLow);
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const res = await fetch("/api/ai-status", { cache: "no-store" });
        if (res.ok && !stopped) setLow(Boolean((await res.json()).creditLow));
      } catch {}
    };
    const timer = setInterval(check, low ? 20_000 : 120_000);
    // An analysis that just made progress means credit is back: check straight away.
    window.addEventListener("sharminator:ai-ok", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("sharminator:ai-ok", check);
    };
  }, [low]);
  if (!low) return null;
  return (
    <div role="status" className="no-print mx-auto mb-6 max-w-[1280px] rounded-lg border border-[#efdcb4] bg-warn-bg px-4 py-3 text-[13px] text-ink">
      <span className="font-medium text-warn">GAIA is paused: the Anthropic account is out of credit.</span>{" "}
      The rest of the app works as normal. Analyses wait and resume once credit is added
      {isAdmin ? (
        <>; this notice clears by itself within a minute or two, or press <Link href="/administration" className="font-medium text-navy-800 underline">Check credit</Link> on the Administration page.</>
      ) : (
        <>. This notice clears by itself once it is.</>
      )}
    </div>
  );
}
