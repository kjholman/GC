import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/session";
import type { Memo } from "@/lib/ai/schema";
import { ExemplarEditor } from "./ExemplarEditor";


export default async function NewExemplarPage({ searchParams }: PageProps<"/training/exemplars/new">) {
  await requireRole("PARTNER");
  const sp = await searchParams;
  const id = typeof sp.analysis === "string" ? sp.analysis : null;
  if (!id) notFound();
  const analysis = await db.analysis.findUnique({ where: { id }, include: { deal: { select: { companyName: true } } } });
  if (!analysis?.memo) notFound();
  return <ExemplarEditor analysisId={analysis.id} companyName={analysis.deal.companyName} version={analysis.version} memo={analysis.memo as unknown as Memo} />;
}
