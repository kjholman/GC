import { db } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth/session";

const CHUNK_BYTES = 16 * 1024 * 1024;
const SCOPES = ["FIRM", "PORTFOLIO", "PAST_DEAL"] as const;

/**
 * Streams one file of any size straight into the database in 16 MB pieces, so
 * nothing is held in memory whole. Called once per file by the uploader; the
 * finishing server action then records the change and starts reading.
 */
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (!hasRole(user.role, "PARTNER")) return Response.json({ error: "Only partners can add files here." }, { status: 403 });
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") as (typeof SCOPES)[number] | null;
  const target = url.searchParams.get("target");
  const filename = (url.searchParams.get("name") ?? "file").slice(0, 250);
  if (!scope || !SCOPES.includes(scope) || (scope !== "FIRM" && !target)) return Response.json({ error: "Bad upload target." }, { status: 400 });
  if (!req.body) return Response.json({ error: "Empty file." }, { status: 400 });

  const record = await db.knowledgeFile.create({
    data: {
      scope,
      portfolioCompanyId: scope === "PORTFOLIO" ? target : null,
      historicalDealId: scope === "PAST_DEAL" ? target : null,
      filename,
      mimeType: req.headers.get("content-type") || "application/octet-stream",
      sizeBytes: BigInt(0),
      status: "UPLOADING",
      uploadedById: user.id,
    },
  });
  try {
    const reader = req.body.getReader();
    let pending: Uint8Array[] = [];
    let pendingBytes = 0;
    let total = 0;
    let index = 0;
    const flush = async () => {
      if (!pendingBytes) return;
      await db.knowledgeFileChunk.create({ data: { fileId: record.id, index: index++, data: Buffer.concat(pending) } });
      pending = [];
      pendingBytes = 0;
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending.push(value);
      pendingBytes += value.length;
      total += value.length;
      if (pendingBytes >= CHUNK_BYTES) await flush();
    }
    await flush();
    if (!total) throw new Error("empty");
    await db.knowledgeFile.update({ where: { id: record.id }, data: { sizeBytes: BigInt(total), status: "READING" } });
    return Response.json({ id: record.id });
  } catch {
    await db.knowledgeFile.delete({ where: { id: record.id } }).catch(() => {});
    return Response.json({ error: `${filename} didn't finish uploading. Try again.` }, { status: 500 });
  }
}
