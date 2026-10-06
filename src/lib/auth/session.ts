import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { generateSessionToken, hashToken } from "./crypto";

export const SESSION_COOKIE = "ga_session";

export async function createSession(userId: string) {
  const token = generateSessionToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000);
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

async function loadUser(touch: boolean) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) {
    return null;
  }
  // Signed out after a period with no activity (6 hours by default).
  if (Date.now() - session.lastSeenAt.getTime() > env.sessionIdleHours * 3600 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }).catch(() => {});
    return null;
  }
  // Touch at most once every 5 minutes to keep writes cheap.
  if (touch && Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return session.user;
}

/** The signed-in user; counts as activity for the idle timeout. */
export const getCurrentUser = cache(() => loadUser(true));

/** For background polling (e.g. analysis progress): checks the session without keeping it alive. */
export const getCurrentUserPassive = cache(() => loadUser(false));

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

const RANK: Record<Role, number> = { ANALYST: 0, PARTNER: 1, ADMIN: 2 };

export async function requireRole(min: Role) {
  const user = await requireUser();
  if (RANK[user.role] < RANK[min]) redirect("/");
  return user;
}

export function hasRole(role: Role, min: Role) {
  return RANK[role] >= RANK[min];
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(SESSION_COOKIE);
}
