import { hasRole, requireUser } from "@/lib/auth/session";
import { getFirmSettings } from "@/lib/training/settings";
import { buildFirmContext } from "@/lib/ai/analyst";
import { ANALYST_PROFILE, METHODOLOGY } from "@/lib/ai/prompts";
import { VERIFIER_PROMPT } from "@/lib/ai/verify";
import { Card, SectionTitle } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";
import { DraftFromDocs } from "@/components/DraftFromDocs";


export default async function PromptPage() {
  const user = await requireUser();
  const [settings, firmContext] = await Promise.all([getFirmSettings(), buildFirmContext()]);
  const sections = [
    { title: "1 · Who GAIA is", body: ANALYST_PROFILE, note: "Who GAIA is and how it reasons. Changes to this part are made by your developer." },
    { title: "2 · How it decides and scores", body: METHODOLOGY, note: "Decision rules, scoring guide, sourcing rules and writing standards. Changes are made by your developer." },
    { title: "3 · What it knows about Genesys (live)", body: firmContext, note: "Built from the firm settings above, the Knowledge base and partner feedback. It changes as you train GAIA." },
    { title: "4 · Fact-checking instructions", body: VERIFIER_PROMPT, note: "A second, independent review that checks every claim in a memo against the sources before anyone sees it." },
  ];
  return (
    <div className="space-y-8">
      <Card>
        <SectionTitle eyebrow="Firm settings" title="What every memo is measured against" />
        {hasRole(user.role, "PARTNER") && (
          <div className="-mt-2 mb-5">
            <p className="mb-2 text-[13px] text-ink-soft">Let GAIA draft these from the firm documents in the Knowledge base. Each draft appears as a suggestion for a partner to accept or edit.</p>
            <DraftFromDocs />
          </div>
        )}
        <SettingsForm settings={settings.map((s) => ({ key: s.key, label: s.label, help: s.help, value: s.value, confirmed: s.confirmed }))} canEdit={hasRole(user.role, "PARTNER")} />
      </Card>
      <Card>
        <SectionTitle eyebrow="Full transparency" title="Exactly what GAIA is told" />
        <p className="-mt-2 mb-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
          These are the complete instructions it receives with every analysis, before the deal&apos;s documents, precedents and research. Nothing is hidden.
        </p>
        <div className="space-y-3">
          {sections.map((s) => (
            <details key={s.title} className="group rounded-lg border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <div>
                  <div className="text-[14px] font-medium text-navy-900">{s.title}</div>
                  <div className="text-[12px] text-muted">{s.note}</div>
                </div>
                <span className="text-muted transition-transform group-open:rotate-90">›</span>
              </summary>
              <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap border-t border-line bg-[#fbfaf7] px-5 py-4 font-mono text-[12px] leading-relaxed text-ink-soft">{s.body}</pre>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
