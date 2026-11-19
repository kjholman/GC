import { getCurrentUserPassive, hasRole } from "@/lib/auth/session";
import { filterFrom, logsAfter, parseId, recentLogs, type LogLine } from "@/lib/logs/query";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const POLL_MS = 1000;
const HEARTBEAT_MS = 15_000;
// Ends each connection after 10 minutes; the browser reconnects on its own (with Last-Event-ID),
// which re-checks the sign-in, so a revoked session stops receiving logs.
const MAX_CONNECTION_MS = 10 * 60_000;

/**
 * Live server logs as Server-Sent Events (administrators only).
 *   GET /api/logs/stream?tail=200&level=warn&source=analyst&q=text&analysis=<id>
 * Sends the last `tail` lines, then each new line as it is saved. Each event is
 * `id: <log id>` + `data: {"id","at","level","source","message","analysisId"}`.
 * Reconnects resume after the Last-Event-ID header (or ?after=<id>) without gaps.
 *   curl -N -H "Cookie: ga_session=…" https://<host>/api/logs/stream
 */
export async function GET(req: Request) {
  const user = await getCurrentUserPassive();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasRole(user.role, "ADMIN")) return Response.json({ error: "Administrators only" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const f = filterFrom(sp);
  const tail = Math.min(1000, Math.max(0, Number(sp.get("tail") ?? 200) || 0));
  const resumeFrom = parseId(req.headers.get("last-event-id")) ?? parseId(sp.get("after"));
  const encoder = new TextEncoder();
  let stopped = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        if (!stopped) controller.enqueue(encoder.encode(s));
      };
      const emit = (lines: LogLine[]) => {
        for (const l of lines) send(`id: ${l.id}\ndata: ${JSON.stringify(l)}\n\n`);
      };
      const stop = () => {
        if (stopped) return;
        stopped = true;
        try { controller.close(); } catch {}
      };
      req.signal.addEventListener("abort", stop);

      send(`retry: 3000\n: connected\n\n`);
      let last: bigint;
      if (resumeFrom !== undefined) {
        last = resumeFrom;
      } else {
        const initial = tail ? await recentLogs(f, tail) : [];
        emit(initial);
        // Without a backlog, start from the newest line overall so only new lines follow.
        last = initial.length ? BigInt(initial[initial.length - 1].id) : ((await db.appLog.findFirst({ orderBy: { id: "desc" }, select: { id: true } }))?.id ?? BigInt(0));
      }

      const started = Date.now();
      let lastSent = Date.now();
      while (!stopped) {
        try {
          // Drain in pages so a burst of lines catches up quickly.
          for (;;) {
            const lines = await logsAfter(f, last, 500);
            if (!lines.length) break;
            emit(lines);
            last = BigInt(lines[lines.length - 1].id);
            lastSent = Date.now();
            if (lines.length < 500 || stopped) break;
          }
        } catch {
          // Database blip: keep the connection and try again next tick.
        }
        if (Date.now() - lastSent > HEARTBEAT_MS) { send(`: keep-alive\n\n`); lastSent = Date.now(); }
        if (Date.now() - started > MAX_CONNECTION_MS) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
      stop();
    },
    cancel() {
      stopped = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
