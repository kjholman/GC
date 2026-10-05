"use client";

import { useActionState, useState } from "react";
import type { DealStatus } from "@prisma/client";
import {
  addNoteAction,
  rerunAnalysisAction,
  signOffAction,
  submitFeedbackAction,
  submitFollowUpAction,
  updateStatusAction,
  type ActionState,
} from "@/lib/deals/actions";
import { Dropzone } from "@/components/Dropzone";
import { Button, Card, Field, STATUS_META, inputCls } from "@/components/ui";

export function FollowUpPanel({ dealId, disabled, openRequests }: { dealId: string; disabled: boolean; openRequests: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitFollowUpAction.bind(null, dealId), { ok: false });
  const [key, setKey] = useState(0);
  return (
    <Card className="!border-gold-300">
      <div className="eyebrow mb-1 text-gold-600">Reopen with new information</div>
      <h3 className="font-serif text-[20px] text-navy-900">Founders replied?</h3>
      <p className="mt-1.5 mb-5 text-[13px] leading-relaxed text-ink-soft">
        Upload what they sent{openRequests ? ` against the ${openRequests} outstanding request${openRequests === 1 ? "" : "s"}` : ""}. The analyst
        re-underwrites the deal using every document received so far and records what changed.
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
        <input name="note" placeholder="Rationale (recorded in the deal log)" className={inputCls} />
        {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
        <Button type="submit" variant="secondary" disabled={pending} className="w-full">
          Update stage
        </Button>
      </form>
    </Card>
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
  ["AGREE", "Agree with the analysis"],
  ["TOO_OPTIMISTIC", "Too optimistic"],
  ["TOO_PESSIMISTIC", "Too pessimistic"],
  ["WRONG_DECISION", "Wrong decision"],
] as const;

export function FeedbackPanel({ analysisId, version, reviews }: { analysisId: string; version: number; reviews: { who: string; verdict: string; comment: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(submitFeedbackAction.bind(null, analysisId), { ok: false });
  const [verdict, setVerdict] = useState("AGREE");
  return (
    <Card>
      <div className="eyebrow mb-1">Calibrate the analyst</div>
      <h3 className="font-serif text-[19px] text-navy-900">Review memo v{version}</h3>
      <p className="mt-1.5 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
        Your critique is added to the analyst&apos;s calibration set and shapes every future analysis.
      </p>
      {reviews.length > 0 && (
        <ul className="mb-4 space-y-2">
          {reviews.map((r, i) => (
            <li key={i} className="rounded-[3px] bg-ivory px-3 py-2 text-[12.5px]">
              <span className="font-medium text-navy-900">{r.who}</span>{" "}
              <span className="text-muted">· {r.verdict.replaceAll("_", " ").toLowerCase()}</span>
              <p className="mt-0.5 text-ink-soft">{r.comment}</p>
            </li>
          ))}
        </ul>
      )}
      {state.ok ? (
        <p className="text-[13px] text-pos">Thank you. Feedback recorded.</p>
      ) : (
        <form action={action} className="space-y-3">
          <select name="verdict" value={verdict} onChange={(e) => setVerdict(e.target.value)} className={inputCls}>
            {VERDICT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {verdict === "WRONG_DECISION" && (
            <select name="correctedRecommendation" className={inputCls} defaultValue="">
              <option value="" disabled>The right call was…</option>
              <option value="REJECT">Decline</option>
              <option value="PENDING_INFO">Request information</option>
              <option value="ADVANCE_TO_DILIGENCE">Advance to diligence</option>
            </select>
          )}
          <textarea
            name="comment"
            rows={3}
            placeholder={verdict === "AGREE" ? "Optional comment" : "What did the analyst miss or mis-weigh?"}
            className={inputCls}
          />
          {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
          <Button type="submit" variant="secondary" disabled={pending} className="w-full">Submit review</Button>
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
    <Card className="!border-gold-300">
      <div className="eyebrow mb-1 text-gold-600">Required before use</div>
      <h3 className="font-serif text-[19px] text-navy-900">Analyst sign-off</h3>
      <p className="mt-1.5 mb-4 text-[12.5px] leading-relaxed text-ink-soft">
        Review the memo and the fact-check against the source materials. The founder response is unlocked once you sign off.
      </p>
      <form action={action} className="space-y-3">
        <label className="flex items-start gap-2 text-[12.5px] text-ink-soft">
          <input type="checkbox" name="acknowledge" className="mt-0.5 accent-navy-900" />
          I have reviewed this memo, its evidence ledger and the fact-check, and it is accurate to the best of my knowledge.
        </label>
        <textarea
          name="note"
          rows={2}
          placeholder={status === "PASSED" ? "Optional note" : "Required: how flagged issues were resolved or why they are acceptable"}
          className={inputCls}
        />
        {state.error && <p className="text-[13px] text-neg">{state.error}</p>}
        <Button type="submit" disabled={pending} className="w-full">Sign off memo v{version}</Button>
      </form>
    </Card>
  );
}
