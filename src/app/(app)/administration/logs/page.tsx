import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { LogViewer } from "./LogViewer";

export default async function LogsPage() {
  await requireRole("ADMIN");
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Server logs"
        actions={<Link href="/administration" className="text-[13px] font-medium text-navy-700 hover:underline">Back to Administration</Link>}
        subtitle="Everything GAIA writes to its server log, saved to the database and shown here as it happens. Keys and passwords are masked before saving. Lines are kept for 30 days."
      />
      <LogViewer />
    </>
  );
}
