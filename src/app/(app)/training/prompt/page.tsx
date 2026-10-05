import { hasRole, requireUser } from "@/lib/auth/session";
import { getFirmSettings } from "@/lib/training/settings";
import { buildFirmContext } from "@/lib/ai/analyst";
import { ANALYST_PROFILE, METHODOLOGY } from "@/lib/ai/prompts";
import { VERIFIER_PROMPT } from "@/lib/ai/verify";
import { Card, SectionTitle } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";

export const metadata = { title: "Prompt & parameters" };

export default async function PromptPage() {
  const user = await requireUser();
  const [settings, firmContext] = await Promise.all([getFirmSettings(), buildFirmContext()]);
  const sections = [
    { title: "1 · Analyst profile and toolkit", body: ANALYST_PROFILE, note: "Fixed in code (src/lib/ai/prompts.ts). Defines who the analyst is and how it reasons." },
    { title: "2 · Method, decision rules and rubric", body: METHODOLOGY, note: "Fixed in code. Decision thresholds, scoring anchors, evidence and writing standards." },
    { title: "3 · Firm context (live)", body: firmContext, note: "Built from what you maintain here, in the Knowledge base and in Calibration. It changes as you train the analyst." },
    { title: "4 · Independent fact-checker", body: VERIFIER_PROMPT, note: "A separate pass that checks every claim in a memo against the source materials before anyone sees it." },
  ];
  return (
    <div className="space-y-8">
      <Card>
        <SectionTitle eyebrow="Firm parameters" title="What every memo is measured against" />
        <SettingsForm settings={settings.map((s) => ({ key: s.key, label: s.label, help: s.help, value: s.value, confirmed: s.confirmed }))} canEdit={hasRole(user.role, "PARTNER")} />
      </Card>
      <Card>
        <SectionTitle eyebrow="Full transparency" title="Exactly what the analyst is told" />
        <p className="-mt-2 mb-6 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
          These are the complete instructions sent with every analysis, ahead of the deal&apos;s documents, its precedents and the research brief. Nothing is hidden.
        </p>
        <div className="space-y-3">
          {sections.map((s) => (
            <details key={s.title} className="group rounded-[3px] border border-line">
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
