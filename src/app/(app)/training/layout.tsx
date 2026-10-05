import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { SubNav } from "@/components/SubNav";

export default async function TrainingLayout({ children }: LayoutProps<"/training">) {
  await requireUser();
  return (
    <>
      <PageHeader
        eyebrow="Training Studio"
        title="Teach the analyst to think like Genesys"
        subtitle="Every analysis draws on what you record here: the firm's past decisions, memos the partners have endorsed, partner corrections, and the firm's own parameters. Backtests measure whether each change makes the analyst better."
      />
      <SubNav
        items={[
          { href: "/training", label: "Overview" },
          { href: "/training/archive", label: "Deal archive" },
          { href: "/training/exemplars", label: "Exemplar memos" },
          { href: "/training/calibration", label: "Calibration" },
          { href: "/training/backtests", label: "Backtests" },
          { href: "/training/prompt", label: "Prompt & parameters" },
        ]}
      />
      {children}
    </>
  );
}
