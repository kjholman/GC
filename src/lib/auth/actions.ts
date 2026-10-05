"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "../db";
import { env, isAllowedDomain, normalizeEmail } from "../env";
import { sendLoginCode } from "../mailer";
import { audit, clientIp } from "../audit";
import { generateCode, hashCode, safeEqualHex } from "./crypto";
import { createSession, destroySession, getCurrentUser } from "./session";

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODES_PER_WINDOW = 5;
const CODE_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type RequestCodeState = { ok: boolean; email?: string; error?: string };

export async function requestCodeAction(_: RequestCodeState, formData: FormData): Promise<RequestCodeState> {
  const parsed = z.string().email().safeParse(String(formData.get("email") ?? ""));
  if (!parsed.success) return { ok: false, error: "Enter a valid email address." };
  const email = normalizeEmail(parsed.data);

  if (!isAllowedDomain(email)) {
    await audit("auth.code_rejected_domain", { meta: { email } });
    return { ok: false, error: "Access is restricted to Genesys Capital email addresses." };
  }

  const user = await db.user.findUnique({ where: { email } });
  const recent = await db.loginCode.count({
    where: { email, createdAt: { gt: new Date(Date.now() - CODE_WINDOW_MS) } },
  });
  if (recent >= MAX_CODES_PER_WINDOW) {
    return { ok: false, error: "Too many codes requested. Please wait 15 minutes and try again." };
  }

  if (user?.active) {
    const code = generateCode();
    await db.loginCode.create({
      data: {
        email,
        codeHash: hashCode(email, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        ip: await clientIp(),
      },
    });
    try {
      await sendLoginCode(email, code);
    } catch (err) {
      console.error("[auth] failed to send code", err);
      return { ok: false, error: "We couldn't send your code. Please contact your administrator." };
    }
    await audit("auth.code_sent", { userId: user.id });
  } else {
    // Record the attempt but respond identically, so the allow-list can't be enumerated.
    await db.loginCode.create({
      data: { email, codeHash: "-", expiresAt: new Date(), ip: await clientIp() },
    });
    await audit("auth.code_rejected_not_allowlisted", { meta: { email } });
  }
  return { ok: true, email };
}

export type VerifyCodeState = { ok: boolean; error?: string };

export async function verifyCodeAction(_: VerifyCodeState, formData: FormData): Promise<VerifyCodeState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Enter the 6-digit code from your email." };

  const record = await db.loginCode.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() }, codeHash: { not: "-" } },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "This code has expired. Request a new one." };
  }

  if (!safeEqualHex(record.codeHash, hashCode(email, code))) {
    await db.loginCode.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    const left = MAX_ATTEMPTS - record.attempts - 1;
    await audit("auth.code_invalid", { meta: { email } });
    return {
      ok: false,
      error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.` : "Too many attempts. Request a new code.",
    };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active) return { ok: false, error: "Your access has been revoked." };

  await db.loginCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id);
  await audit("auth.signed_in", { userId: user.id });
  redirect("/");
}

export async function signOutAction() {
  const user = await getCurrentUser();
  await destroySession();
  if (user) await audit("auth.signed_out", { userId: user.id });
  redirect("/login");
}

/**
 * TEMPORARY: signs in as the first administrator without an emailed code.
 * Only works while ENABLE_ADMIN_BYPASS=true. Every use is audit-logged.
 */
export async function adminBypassAction() {
  if (!env.adminBypassEnabled) redirect("/login");
  let admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } });
  if (!admin) {
    const email = normalizeEmail((process.env.SEED_ADMIN_EMAILS ?? "").split(",")[0] || "admin@genesyscapital.com");
    admin = await db.user.upsert({ where: { email }, create: { email, role: "ADMIN" }, update: { role: "ADMIN", active: true } });
  }
  await db.user.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await createSession(admin.id);
  await audit("auth.admin_bypass_used", { userId: admin.id });
  redirect("/");
}
