import "server-only";
import { db } from "../db";

/** "Northbridge Therapeutics, Inc." → "northbridge-therapeutics-inc" */
export function slugify(name: string): string {
  const s = name
    .replace(/^Untitled:\s*/i, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "deal";
}

/** Gives the deal a unique, readable URL based on its current name. Returns the slug. */
export async function refreshSlug(dealId: string): Promise<string> {
  const deal = await db.deal.findUnique({ where: { id: dealId }, select: { companyName: true, slug: true } });
  if (!deal) return dealId;
  const base = slugify(deal.companyName);
  if (deal.slug && (deal.slug === base || new RegExp(`^${base}-\\d+$`).test(deal.slug))) return deal.slug;
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await db.deal.findFirst({ where: { slug: candidate, id: { not: dealId } }, select: { id: true } });
    if (!taken) {
      await db.deal.update({ where: { id: dealId }, data: { slug: candidate } });
      return candidate;
    }
  }
  return dealId;
}

/** Link to a deal page: the readable slug when there is one, else the id. */
export const dealPath = (d: { id: string; slug?: string | null }) => `/deals/${d.slug ?? d.id}`;
