import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { knowledgeFileStream } from "@/lib/knowledge/files";
import { audit } from "@/lib/audit";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const f = await db.knowledgeFile.findUnique({ where: { id }, select: { filename: true, mimeType: true, sizeBytes: true } });
  if (!f) return new Response("Not found", { status: 404 });
  await audit("knowledge.file_downloaded", { userId: user.id, entity: "KnowledgeFile", entityId: id, meta: { name: f.filename } });
  return new Response(knowledgeFileStream(id), {
    headers: {
      "Content-Type": f.mimeType || "application/octet-stream",
      "Content-Length": f.sizeBytes.toString(),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
