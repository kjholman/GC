import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "./db";

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

export async function audit(
  action: string,
  opts: { userId?: string | null; entity?: string; entityId?: string; meta?: Prisma.InputJsonValue } = {},
) {
  try {
    await db.auditLog.create({
      data: {
        action,
        userId: opts.userId ?? null,
        entity: opts.entity,
        entityId: opts.entityId,
        meta: opts.meta,
        ip: await clientIp().catch(() => null),
      },
    });
  } catch (err) {
    console.error("[audit] failed to record", action, err);
  }
}
