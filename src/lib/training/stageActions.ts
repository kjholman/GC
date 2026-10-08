"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { diffFields } from "../changes";
import { requireRole } from "../auth/session";
import { STAGE_FIELDS, STAGE_LABELS } from "./stages";

export type StageState = { ok: boolean; error?: string; message?: string };

/** Saves one funding stage. Saving also confirms it, so it no longer shows as a starting value. */
export async function saveFundingStageAction(id: string | null, _: StageState, fd: FormData): Promise<StageState> {
  const user = await requireRole("PARTNER");
  const name = String(fd.get("name") ?? "").trim().slice(0, 100);
  if (!name) return { ok: false, error: "Give the stage a name, such as Seed or Series A." };
  const scope = String(fd.get("scope") ?? "CORE");
  const data: Record<string, unknown> = { name, scope: ["CORE", "SELECTIVE", "OUT"].includes(scope) ? scope : "CORE", confirmed: true };
  for (const f of STAGE_FIELDS) {
    const v = String(fd.get(f.key) ?? "").trim().slice(0, 2000);
    data[f.key] = v || null;
  }
  const before = id ? await db.fundingStage.findUnique({ where: { id } }) : null;
  const saved = id
    ? await db.fundingStage.update({ where: { id }, data })
    : await db.fundingStage.create({ data: { ...(data as { name: string }), position: ((await db.fundingStage.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1 } });
  await audit(id ? "stage.updated" : "stage.created", {
    userId: user.id,
    entity: "FundingStage",
    entityId: saved.id,
    meta: { name: saved.name, changes: diffFields(before, saved, STAGE_LABELS), ...(before ? { before: snap(before) } : {}) },
  });
  revalidatePath("/training", "layout");
  revalidatePath("/knowledge");
  return { ok: true, message: `${saved.name} saved. Every analysis from now on is measured against it.` };
}

export async function deleteFundingStageAction(id: string) {
  const user = await requireRole("PARTNER");
  const s = await db.fundingStage.delete({ where: { id } });
  await audit("stage.deleted", { userId: user.id, entity: "FundingStage", entityId: id, meta: { name: s.name, before: snap(s), changes: [{ field: "Stage", from: s.name, to: "(removed)" }] } });
  revalidatePath("/training", "layout");
}

function snap(rec: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(rec));
}
