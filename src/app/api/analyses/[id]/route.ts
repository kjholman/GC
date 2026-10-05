import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const a = await db.analysis.findUnique({
    where: { id },
    select: { status: true, progress: true, error: true, startedAt: true },
  });
  if (!a) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(a, { headers: { "Cache-Control": "no-store" } });
}
