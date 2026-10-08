import { getCurrentUser } from "@/lib/auth/session";
import { TEMPLATES, templateCsv, templateXlsx } from "@/lib/knowledge/templates";

/** Downloadable import templates: /api/templates/portfolio?format=xlsx (or csv). */
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const t = TEMPLATES[(await ctx.params).name];
  if (!t) return new Response("No such template.", { status: 404 });
  const xlsx = new URL(req.url).searchParams.get("format") === "xlsx";
  const body = xlsx ? new Uint8Array(await templateXlsx(t)) : templateCsv(t);
  return new Response(body, {
    headers: {
      "Content-Type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${t.filename}.${xlsx ? "xlsx" : "csv"}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
