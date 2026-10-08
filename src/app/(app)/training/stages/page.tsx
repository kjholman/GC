import { hasRole, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { ChangeLog } from "@/components/ChangeLog";
import { Card, SectionTitle } from "@/components/ui";
import { StageList } from "./StageList";

export default async function StagesPage() {
  const user = await requireUser();
  const canEdit = hasRole(user.role, "PARTNER");
  const [stages, portfolio] = await Promise.all([
    db.fundingStage.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    db.portfolioCompany.findMany({ where: { stageAtEntry: { not: null } }, select: { name: true, stageAtEntry: true, checkSize: true, entryValuation: true, roundSize: true } }),
  ]);
  // What the firm actually did at each stage, from the portfolio records, shown beside the playbook.
  const actual: Record<string, string[]> = {};
  for (const s of stages) {
    const key = s.name.toLowerCase().replace(/[^a-z]/g, "");
    actual[s.id] = portfolio
      .filter((p) => p.stageAtEntry!.toLowerCase().replace(/[^a-z]/g, "").startsWith(key.slice(0, 7)))
      .map((p) => [p.name, p.checkSize && `cheque ${p.checkSize}`, p.roundSize && `round ${p.roundSize}`, p.entryValuation && `valuation ${p.entryValuation}`].filter(Boolean).join(", "));
  }
  const unconfirmed = stages.filter((s) => !s.confirmed).length;
  return (
    <div className="space-y-8">
      <Card>
        <SectionTitle eyebrow="Funding stages" title="How Genesys invests at each stage" />
        <p className="-mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-soft">
          For each stage, record the cheque Genesys writes, typical round sizes and valuations, the ownership you aim for, what a company must already have proven, and what the round should achieve. GAIA works out which stage each deal is at and checks the proposed round against this playbook. Anything out of line, such as a valuation above the usual range or a round too small to reach its milestone, is called out in the memo.
        </p>
        {unconfirmed > 0 && (
          <p className="mt-3 text-[13px] text-warn">
            {unconfirmed} of {stages.length} stages still show starting values. Check the figures and save each one to confirm it.
          </p>
        )}
      </Card>
      <StageList
        canEdit={canEdit}
        stages={stages.map((s) => ({ ...s, createdAt: undefined, updatedAt: s.updatedAt.toISOString(), actual: actual[s.id] ?? [] }))}
      />
      <ChangeLog prefixes={["stage."]} page={1} href={() => "/training/history"} title="Changes to the funding stages" undoable={canEdit} pageSize={10} />
    </div>
  );
}
