import { getCurrentUser, hasRole } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { exportDataset } from "@/lib/training/engine";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user.role, "PARTNER")) return new Response("Forbidden", { status: 403 });
  await audit("training.dataset_exported", { userId: user.id });
  const iter = exportDataset();
  const stream = new ReadableStream({
    async pull(controller) {
      const { value, done } = await iter.next();
      if (done) controller.close();
      else controller.enqueue(new TextEncoder().encode(value));
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": `attachment; filename="genesys-training-${new Date().toISOString().slice(0, 10)}.jsonl"`,
      "Cache-Control": "no-store",
    },
  });
}
