import { requireUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { SubNav } from "@/components/SubNav";

export default async function TrainingLayout({ children }: LayoutProps<"/training">) {
  await requireUser();
  return (
    <>
      <PageHeader
        eyebrow="Training Studio"
        title="Teach the Sharminator to think like Genesys"
        subtitle="Every analysis draws on what you record here: the firm's past deals, memos the partners consider exemplary, partner feedback and the firm's own settings. Accuracy tests show whether each change makes the Sharminator better."
      />
      <SubNav
        items={[
          { href: "/training", label: "Overview" },
          { href: "/training/archive", label: "Past deals" },
          { href: "/training/exemplars", label: "Example memos" },
          { href: "/training/calibration", label: "Partner feedback" },
          { href: "/training/backtests", label: "Accuracy tests" },
          { href: "/training/prompt", label: "Firm settings" },
          { href: "/training/history", label: "Change history" },
        ]}
      />
      {children}
    </>
  );
}
