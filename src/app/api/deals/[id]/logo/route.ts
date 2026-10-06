import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const deal = await db.deal.findUnique({ where: { id }, select: { logo: true, logoMime: true } });
  if (!deal?.logo || !deal.logoMime) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(deal.logo), {
    headers: {
      "Content-Type": deal.logoMime,
      "Cache-Control": "private, max-age=86400",
      // Logos come from third-party sites: never let one run script (matters for SVG).
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
