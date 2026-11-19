import { getCurrentUserPassive, hasRole } from "@/lib/auth/session";
import { filterFrom, logsAfter, parseId, recentLogs } from "@/lib/logs/query";

/**
 * Server log history as JSON (administrators only).
 *   GET /api/logs?limit=200                     latest lines
 *   GET /api/logs?before=<id>                   older lines (paging back)
 *   GET /api/logs?after=<id>                    newer lines (polling)
 * Filters: level=debug|info|warn|error (minimum), source=analyst, q=text, analysis=<id>.
 */
export async function GET(req: Request) {
  const user = await getCurrentUserPassive();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasRole(user.role, "ADMIN")) return Response.json({ error: "Administrators only" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const f = filterFrom(sp);
  const limit = Math.min(1000, Math.max(1, Number(sp.get("limit")) || 200));
  const after = parseId(sp.get("after"));
  const lines = after !== undefined ? await logsAfter(f, after, limit) : await recentLogs(f, limit, parseId(sp.get("before")));
  return Response.json({ lines }, { headers: { "Cache-Control": "no-store" } });
}
