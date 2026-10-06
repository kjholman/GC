import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { memoToDocx } from "@/lib/deals/memoDocx";
import type { Memo } from "@/lib/ai/schema";
import type { VerificationReport } from "@/lib/ai/verify";

const FACT_CHECK: Record<string, string> = {
  PASSED: "passed; every important claim traced to a source",
  WARNINGS: "a few points to review",
  FAILED: "problems remain; check before relying on it",
};

/** The memo of one analysis version as a Word document. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const a = await db.analysis.findUnique({
    where: { id },
    select: { memo: true, version: true, completedAt: true, createdAt: true, verification: true, deal: { select: { companyName: true } } },
  });
  if (!a?.memo) return new Response("No memo for this version yet.", { status: 404 });
  const report = a.verification as VerificationReport | null;
  const buf = await memoToDocx({
    memo: a.memo as unknown as Memo,
    companyName: a.deal.companyName,
    version: a.version,
    date: a.completedAt ?? a.createdAt,
    factCheck: report?.status ? FACT_CHECK[report.status] ?? null : null,
  });
  const name = `${a.deal.companyName.replace(/[^\w .-]+/g, "").trim() || "Deal"} - Investment memo v${a.version}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
