"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_AREAS, FEEDBACK_AREA_LABEL } from "@/lib/feedback/options";
import type { DealStatus } from "@prisma/client";
import {
  addNoteAction,
  resumeAnalysisAction, rerunAnalysisAction,
  signOffAction,
  submitFeedbackAction,
  submitFollowUpAction,
  updateStatusAction,
  type ActionState,
} from "@/lib/deals/actions";
import { Dropzone } from "@/components/Dropzone";
import { Button, Card, Field, STATUS_META, cx, inputCls } from "@/components/ui";

export function FollowUpPanel({ dealId, disabled, openRequests }: { dealId: string; disabled: boolean; openRequests: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitFollowUpAction.bind(null, dealId), { ok: false });
  const [key, setKey] = useState(0);
  return (
    <Card className="!border-brand-300">
      <div className="eyebrow mb-1 text-brand-600">Reopen with new information</div>
      <h3 className="font-display font-semibold text-[20px] text-navy-900">Founders replied?</h3>
      <p className="mt-1.5 mb-5 text-[13px] leading-relaxed text-ink-soft">
        Upload what they sent{openRequests ? ` against the ${openRequests} outstanding request${openRequests === 1 ? "" : "s"}` : ""}. The Sharminator
        re-analyses the deal using every document received so far and notes what changed.
      </p>
      <form
        key={key}
        action={async (fd) => {
          await action(fd);
          setKey((k) => k + 1);
        }}
        className="space-y-4"
      >
        <Dropzone prompt="Drop additional materials" compact />
        <Field label="Document category">
          <select name="kind" className={inputCls} defaultValue="OTHER">
            <option value="FINANCIAL_MODEL">Financial model / cap table</option>
            <option value="SCIENTIFIC_DATA">Scientific data</option>
            <option value="CLINICAL_REGULATORY">Clinical / regulatory</option>
            <option value="IP_DOCUMENTATION">IP documentation</option>
            <option value="PITCH_DECK">Updated deck</option>
            <option value="CORRESPONDENCE">Correspondence</option>
            <option value="OTHER">Other</option>
          </select>
        </Field>
        <Field label="What was received" hint="Summarise call notes or email answers here if there are no files.">
          <textarea name="analystContext" rows={3} className={inputCls} />
        </Field>
        {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
        <Button type="submit" disabled={pending || disabled} className="w-full">
          {pending ? "Submitting…" : disabled ? "Analysis in progress" : "Re-run analysis with new information"}
        </Button>
      </form>
    </Card>
  );
}

const ORDER: DealStatus[] = ["SCREENING", "PENDING_INFO", "DILIGENCE", "IC_REVIEW", "INVESTED", "REJECTED", "ARCHIVED"];

export function StatusPanel({ dealId, status, canPartner }: { dealId: string; status: DealStatus; canPartner: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateStatusAction.bind(null, dealId), { ok: false });
  return (
    <Card>
      <div className="eyebrow mb-4">Stage decision</div>
      <form action={action} className="space-y-3">
        <select name="status" defaultValue={status} className={inputCls}>
          {ORDER.map((s) => (
            <option key={s} value={s} disabled={!canPartner && (s === "IC_REVIEW" || s === "INVESTED")}>
              {STATUS_META[s].label}
              {!canPartner && (s === "IC_REVIEW" || s === "INVESTED") ? " (partner)" : ""}
            </option>
          ))}
        </select>
        <input name="note" placeholder="Reason (saved to the deal log)" className={inputCls} />
        {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          Update stage
        </Button>
      </form>
    </Card>
  );
}

export function ResumeButton({ analysisId }: { analysisId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const res = await resumeAnalysisAction(analysisId);
          if (!res.ok) setError(res.error);
          setPending(false);
        }}
      >
        {pending ? "Resuming…" : "Resume analysis"}
      </Button>
      {error && <p className="mt-1 text-[12px] text-neg">{error}</p>}
    </div>
  );
}

export function RerunButton({ dealId, disabled }: { dealId: string; disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div>
      <Button
        variant="ghost"
        disabled={disabled || pending}
        onClick={async () => {
          setPending(true);
          const res = await rerunAnalysisAction(dealId);
          if (!res.ok) setError(res.error);
          setPending(false);
        }}
      >
        ↻ Re-run analysis
      </Button>
      {error && <p className="mt-1 text-[12px] text-neg">{error}</p>}
    </div>
  );
}

export function NoteForm({ dealId }: { dealId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addNoteAction.bind(null, dealId), { ok: false });
  const [key, setKey] = useState(0);
  return (
    <form
      key={key}
      action={async (fd) => {
        await action(fd);
        setKey((k) => k + 1);
      }}
      className="space-y-3"
    >
      <textarea name="note" rows={3} placeholder="Add a note for the deal team…" className={inputCls} />
      {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
      <Button type="submit" variant="secondary" disabled={pending}>
        Add note
      </Button>
    </form>
  );
}

const VERDICT_OPTIONS = [
  ["AGREE", "Agree"],
  ["TOO_OPTIMISTIC", "Too optimistic"],
  ["TOO_PESSIMISTIC", "Too pessimistic"],
  ["WRONG_DECISION", "Wrong decision"],
] as const;
const VERDICT_LABEL: Record<string, string> = Object.fromEntries(VERDICT_OPTIONS);

export type Review = { who: string; verdict: string; comment: string; areas: string[]; lesson: string | null; appliesTo: string | null };

export function FeedbackPanel({ analysisId, version, reviews }: { analysisId: string; version: number; reviews: Review[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev: ActionState, fd: FormData) => {
    const res = await submitFeedbackAction(analysisId, prev, fd);
    // The lesson is written in the background; show it once it's ready.
    if (res.ok) for (const ms of [8000, 20000, 45000]) setTimeout(() => router.refresh(), ms);
    return res;
  }, { ok: false });
  const [verdict, setVerdict] = useState("AGREE");
  const [picked, setPicked] = useState<string[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <Card>
      <div className="eyebrow mb-1">Teach the Sharminator</div>
      <h3 className="font-display font-semibold text-[19px] text-navy-900">Review this memo (version {version})</h3>
      <p className="mt-1.5 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
        Tick what it got wrong and add anything in your own words. The Sharminator turns each review into a lesson it applies to future deals, and to the next version of this one.
      </p>
      {reviews.length > 0 && (
        <ul className="mb-5 space-y-2.5">
          {reviews.map((r, i) => (
            <li key={i} className="rounded-lg bg-mist px-3 py-2.5 text-[12.5px]">
              <span className="font-medium text-navy-900">{r.who}</span> <span className="text-muted">· {VERDICT_LABEL[r.verdict]?.toLowerCase() ?? r.verdict}</span>
              {r.areas.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.areas.map((a) => <span key={a} className="rounded-full bg-paper px-2 py-0.5 text-[11px] text-ink-soft">{FEEDBACK_AREA_LABEL[a] ?? a}</span>)}
                </div>
              )}
              <p className="mt-1.5 text-ink-soft">{r.comment}</p>
              <div className="mt-2 border-l-2 border-brand-500 pl-2.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-brand-600">Lesson it will apply</div>
                {r.lesson ? (
                  <p className="mt-0.5 text-ink">{r.lesson}{r.appliesTo && <span className="text-muted"> ({r.appliesTo})</span>}</p>
                ) : (
                  <p className="mt-0.5 italic text-muted">Working this out…</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.ok ? (
        <p className="text-[13px] text-pos">Thank you. The Sharminator is turning this into a lesson; it will appear above shortly.</p>
      ) : (
        <form action={action} className="space-y-4">
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-ink-soft">Overall</div>
            <input type="hidden" name="verdict" value={verdict} />
            <div className="grid grid-cols-2 gap-1.5">
              {VERDICT_OPTIONS.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVerdict(v)}
                  className={cx(
                    "rounded-lg border px-2.5 py-2 text-[12.5px] transition-colors",
                    verdict === v ? "border-navy-900 bg-navy-900 text-white" : "border-line-strong bg-paper text-ink-soft hover:border-navy-700",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {verdict === "WRONG_DECISION" && (
            <select name="correctedRecommendation" className={inputCls} defaultValue="">
              <option value="" disabled>The right call was…</option>
              <option value="REJECT">Decline</option>
              <option value="PENDING_INFO">Request information</option>
              <option value="ADVANCE_TO_DILIGENCE">Advance to diligence</option>
            </select>
          )}
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-ink-soft">
              What did it get wrong? <span className="font-normal text-muted">(tick any that apply)</span>
            </div>
            {picked.map((id) => <input key={id} type="hidden" name="areas" value={id} />)}
            <div className="divide-y divide-line rounded-lg border border-line">
              {FEEDBACK_AREAS.map((g) => {
                const count = g.options.filter((o) => picked.includes(o.id)).length;
                const open = openGroup === g.group;
                return (
                  <div key={g.group}>
                    <button type="button" onClick={() => setOpenGroup(open ? null : g.group)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] text-ink hover:bg-mist/60">
                      <span>{g.group}{count > 0 && <span className="ml-1.5 rounded-full bg-brand-100 px-1.5 text-[11px] font-medium text-brand-700">{count}</span>}</span>
                      <span className="text-muted">{open ? "−" : "+"}</span>
                    </button>
                    {open && (
                      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                        {g.options.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            aria-pressed={picked.includes(o.id)}
                            onClick={() => toggle(o.id)}
                            className={cx(
                              "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                              picked.includes(o.id) ? "border-brand-600 bg-brand-100 text-brand-700" : "border-line-strong bg-paper text-ink-soft hover:border-navy-700",
                            )}
                          >
                            {picked.includes(o.id) ? "✓ " : ""}{o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[12.5px] font-medium text-ink-soft">In your own words</div>
            <textarea
              name="comment"
              rows={3}
              placeholder={verdict === "AGREE" ? "Optional: what it got right" : "e.g. The rat tox study is too thin to call hepatic safety a differentiator; we'd want a second species first."}
              className={inputCls}
            />
          </div>
          {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
          <Button type="submit" variant="secondary" disabled={pending} className="w-full">{pending ? "Saving…" : "Submit review"}</Button>
        </form>
      )}
    </Card>
  );
}

export function SignOffPanel({ analysisId, version, status, signedOff }: { analysisId: string; version: number; status: string | null; signedOff: { by: string; at: string; note: string | null } | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(signOffAction.bind(null, analysisId), { ok: false });
  if (signedOff) {
    return (
      <Card className="!border-[#c9e2d9]">
        <div className="eyebrow mb-1 text-pos">Signed off</div>
        <p className="text-[13px] text-ink-soft">Memo v{version} reviewed by <span className="font-medium text-ink">{signedOff.by}</span>, {signedOff.at}.</p>
        {signedOff.note && <p className="mt-2 text-[12.5px] italic text-muted">“{signedOff.note}”</p>}
      </Card>
    );
  }
  return (
    <Card className="!border-brand-300">
      <div className="eyebrow mb-1 text-brand-600">Required before use</div>
      <h3 className="font-display font-semibold text-[19px] text-navy-900">Analyst sign-off</h3>
      <p className="mt-1.5 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
        Review the memo and the fact-check against the source materials. The founder response is unlocked once you sign off.
      </p>
      <form action={action} className="space-y-3">
        <label className="flex items-start gap-2 text-[12.5px] text-ink-soft">
          <input type="checkbox" name="acknowledge" className="mt-0.5 accent-navy-900" />
          I have reviewed this memo, its sources and the fact-check, and it is accurate to the best of my knowledge.
        </label>
        <textarea
          name="note"
          rows={2}
          placeholder={status === "PASSED" ? "Optional note" : "Required: how flagged issues were resolved or why they are acceptable"}
          className={inputCls}
        />
        {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
        <Button type="submit" disabled={pending} className="w-full">Sign off this memo</Button>
      </form>
    </Card>
  );
}
