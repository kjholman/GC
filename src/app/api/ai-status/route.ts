import { after } from "next/server";
import { getAiStatus, recheckCreditIfFlagged } from "@/lib/ai/credit";
import { getCurrentUserPassive as getCurrentUser } from "@/lib/auth/session";
import { resumeAllPaused } from "@/lib/deals/scheduler";

/** Whether the Anthropic account is flagged as out of credit; polled by the banner so it clears without a reload. */
export async function GET() {
  if (!(await getCurrentUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ai = await getAiStatus().catch(() => null);
  // While flagged, re-check in the background so the flag clears soon after credit is added.
  if (ai?.creditLowSince) after(() => recheckCreditIfFlagged(resumeAllPaused).catch(() => {}));
  return Response.json({ creditLow: !!ai?.creditLowSince }, { headers: { "Cache-Control": "no-store" } });
}
