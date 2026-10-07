import "server-only";
import type { PortfolioCompany } from "@prisma/client";
import { db } from "../db";
import { cleanDomain } from "./logo";

// Words that vary between how a company is written ("Acme Therapeutics Inc." vs "ACME Bio").
const GENERIC = /\b(inc|incorporated|corp|corporation|ltd|limited|llc|co|company|therapeutics?|bio|biotech|biotechnologies|biosciences?|biologics|pharma|pharmaceuticals?|medical|medtech|sciences?|technologies|technology|tech|health|healthcare|labs?|diagnostics|devices|systems|group|holdings|canada)\b/g;

/** "Acme Therapeutics Inc." → "acme" */
export function coreName(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(GENERIC, " ").replace(/\s+/g, " ").trim();
}

/**
 * The portfolio company this deal is, if any: same website domain, or the same
 * name once legal suffixes and generic words are set aside.
 */
export async function findPortfolioMatch(input: { names: (string | null | undefined)[]; websites: (string | null | undefined)[] }): Promise<PortfolioCompany | null> {
  const companies = await db.portfolioCompany.findMany();
  const domains = new Set(input.websites.map((w) => cleanDomain(w)).filter(Boolean) as string[]);
  const names = input.names.map((n) => coreName(n ?? "")).filter((n) => n.length >= 3);
  for (const c of companies) {
    const d = cleanDomain(c.website);
    if (d && domains.has(d)) return c;
  }
  for (const c of companies) {
    const cn = coreName(c.name);
    if (cn.length < 3) continue;
    if (names.some((n) => n === cn || n.replace(/ /g, "") === cn.replace(/ /g, ""))) return c;
  }
  return null;
}
