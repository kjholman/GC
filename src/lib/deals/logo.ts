import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { db } from "../db";

const MAX_BYTES = 1024 * 1024;
const TIMEOUT_MS = 8000;

/** Blocks requests to private or internal addresses (the website comes from a founder's deck). */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function safeFetch(url: string, accept: string): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const addrs = await lookup(u.hostname, { all: true }).catch(() => []);
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
    const res = await fetch(u, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept, "user-agent": "Mozilla/5.0 (compatible; GenesysSharminator/1.0)" },
    }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    return res.ok ? res : null;
  }
  return null;
}

/** Candidate logo URLs from a homepage, best first: the declared organisation logo, then app icons, then favicons. */
function candidates(html: string, base: URL): string[] {
  const out: string[] = [];
  const abs = (h: string) => {
    try { return new URL(h.replace(/&amp;/g, "&"), base).toString(); } catch { return null; }
  };
  // schema.org Organization logo in JSON-LD
  for (const m of html.matchAll(/"logo"\s*:\s*(?:\{[^}]*?"url"\s*:\s*)?"([^"]+)"/g)) { const u = abs(m[1]); if (u) out.push(u); }
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
  const icons = links
    .map((t) => ({ rel: (attr(t, "rel") ?? "").toLowerCase(), href: attr(t, "href"), size: Number((attr(t, "sizes") ?? "").split("x")[0]) || 0 }))
    .filter((l) => l.href && /icon/.test(l.rel));
  icons.sort((a, b) => Number(b.rel.includes("apple")) - Number(a.rel.includes("apple")) || b.size - a.size);
  for (const l of icons) { const u = abs(l.href!); if (u) out.push(u); }
  const fav = abs("/favicon.ico");
  if (fav) out.push(fav);
  return [...new Set(out)];
}

/** Finds the company's logo from its website and stores it on the deal. Never throws. */
export async function fetchCompanyLogo(dealId: string): Promise<boolean> {
  try {
    const deal = await db.deal.findUnique({ where: { id: dealId }, select: { website: true, logo: true } });
    if (!deal?.website || deal.logo) return false;
    const home = new URL(deal.website.startsWith("http") ? deal.website : `https://${deal.website}`);
    const page = await safeFetch(home.toString(), "text/html");
    const html = page ? (await page.text()).slice(0, 500_000) : "";
    for (const url of candidates(html, page ? new URL(page.url || home.toString()) : home)) {
      const res = await safeFetch(url, "image/*");
      const mime = res?.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      if (!res || !/^image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/.test(mime)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) continue;
      await db.deal.update({ where: { id: dealId }, data: { logo: buf, logoMime: mime, logoCheckedAt: new Date() } });
      return true;
    }
  } catch (err) {
    console.error("[logo] could not fetch", dealId, err);
  }
  await db.deal.update({ where: { id: dealId }, data: { logoCheckedAt: new Date() } }).catch(() => {});
  return false;
}
