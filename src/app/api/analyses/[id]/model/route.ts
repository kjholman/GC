import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { memoToXlsx } from "@/lib/deals/memoXlsx";
import type { Memo } from "@/lib/ai/schema";

/** The memo's numbers as a working Excel model (return scenarios, milestones, market sizing). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const a = await db.analysis.findUnique({ where: { id }, select: { memo: true, version: true, deal: { select: { companyName: true } } } });
  if (!a?.memo) return new Response("No memo for this version yet.", { status: 404 });
  const buf = await memoToXlsx({ memo: a.memo as unknown as Memo, companyName: a.deal.companyName, version: a.version });
  const name = `${a.deal.companyName.replace(/[^\w .-]+/g, "").trim() || "Deal"} - Financial model v${a.version}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
