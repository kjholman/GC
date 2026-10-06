"use client";

import { useActionState, useRef, useState } from "react";
import { requestCodeAction, verifyCodeAction, type RequestCodeState, type VerifyCodeState } from "@/lib/auth/actions";
import { Button, cx, inputCls } from "@/components/ui";

export type LoginPerson = { id: string; name: string; fullName: string; title: string; enabled: boolean; photo: string | null };

export function LoginForm({ people }: { people: LoginPerson[] }) {
  const [requestState, request, requesting] = useActionState<RequestCodeState, FormData>(requestCodeAction, { ok: false });
  const [verifyState, verify, verifying] = useActionState<VerifyCodeState, FormData>(verifyCodeAction, { ok: false });
  const [restart, setRestart] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [byEmail, setByEmail] = useState(people.length === 0);
  const sent = requestState.ok && requestState.email && restart === 0;
  const pickedPerson = people.find((p) => p.id === picked);

  if (!sent) {
    return (
      <form action={(fd) => { setRestart(0); request(fd); }} className="space-y-6">
        <div>
          <div className="eyebrow mb-2 text-brand-600">Secure sign-in</div>
          <h2 className="font-display font-semibold text-[30px] leading-tight text-navy-900">Welcome back</h2>
          <p className="mt-2 text-[14px] text-ink-soft">
            {byEmail ? "Enter your Genesys Capital email. We'll send you a one-time code." : "Who's signing in? We'll email you a one-time code."}
          </p>
        </div>
        {byEmail ? (
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-ink-soft">Work email</span>
            <input name="email" type="email" required autoFocus autoComplete="email" placeholder="name@genesyscapital.com" defaultValue={requestState.email} className={inputCls} />
          </label>
        ) : (
          <div role="radiogroup" aria-label="Choose your name" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {picked && <input type="hidden" name="person" value={picked} />}
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={picked === p.id}
                disabled={!p.enabled}
                onClick={() => setPicked(p.id)}
                title={p.enabled ? [p.fullName, p.title].filter(Boolean).join(", ") : `${p.fullName}: sign-in not set up yet`}
                className={cx(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors",
                  picked === p.id ? "border-brand-600 bg-brand-100/60 ring-2 ring-brand-500/30" : "border-line hover:border-navy-700",
                  !p.enabled && "cursor-not-allowed opacity-45 hover:border-line",
                )}
              >
                <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-brand-gradient font-display text-[16px] font-semibold text-white">
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    p.name[0]
                  )}
                </span>
                <span className="text-[12.5px] font-medium text-ink">{p.name}</span>
                {!p.enabled && <span className="-mt-1 text-[10px] text-muted">Coming soon</span>}
              </button>
            ))}
          </div>
        )}
        {requestState.error && <p className="text-[13px] text-neg">{requestState.error}</p>}
        <Button type="submit" disabled={requesting || (!byEmail && !pickedPerson)} className="w-full py-3">
          {requesting ? "Sending code…" : byEmail ? "Email me a sign-in code" : pickedPerson ? `Log in as ${pickedPerson.name}` : "Choose your name"}
        </Button>
        {people.length > 0 && (
          <button type="button" onClick={() => setByEmail((v) => !v)} className="block w-full text-center text-[12.5px] text-navy-700 hover:underline">
            {byEmail ? "Choose from the team instead" : "Sign in with a different email"}
          </button>
        )}
      </form>
    );
  }

  return (
    <form action={verify} className="space-y-6">
      <div>
        <div className="eyebrow mb-2 text-brand-600">Check your inbox</div>
        <h2 className="font-display font-semibold text-[30px] leading-tight text-navy-900">Enter your code</h2>
        <p className="mt-2 text-[14px] text-ink-soft">
          If <span className="font-medium text-ink">{requestState.email}</span> is authorised, a 6-digit code is on its way.
          It expires in 10 minutes.
        </p>
      </div>
      <input type="hidden" name="email" value={requestState.email} />
      <CodeInput />
      {verifyState.error && <p className="text-[13px] text-neg">{verifyState.error}</p>}
      <Button type="submit" disabled={verifying} className="w-full py-3">
        {verifying ? "Verifying…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={() => setRestart((n) => n + 1)}
        className="w-full text-center text-[13px] text-navy-700 underline-offset-4 hover:underline"
      >
        Use a different email or resend
      </button>
    </form>
  );
}

function CodeInput() {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setAt = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      const next = [...digits];
      clean.slice(0, 6 - i).split("").forEach((d, k) => (next[i + k] = d));
      setDigits(next);
      refs.current[Math.min(5, i + clean.length)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };

  return (
    <div>
      <input type="hidden" name="code" value={digits.join("")} />
      <div className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={d}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) refs.current[i - 1]?.focus();
            }}
            onPaste={(e) => {
              e.preventDefault();
              setAt(i, e.clipboardData.getData("text"));
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            autoFocus={i === 0}
            aria-label={`Digit ${i + 1}`}
            className="h-14 w-full rounded-lg border border-line-strong bg-paper text-center font-display font-semibold text-[26px] text-navy-900 focus:border-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-100"
          />
        ))}
      </div>
    </div>
  );
}
