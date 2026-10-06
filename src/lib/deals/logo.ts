import "server-only";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { db } from "../db";

const MAX_BYTES = 3 * 1024 * 1024;
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
      headers: { accept, "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
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
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
  // <img> tags that are plainly the site logo (src, alt, class or id mentions "logo"), header ones first.
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  for (const t of imgs) {
    const src = attr(t, "src") ?? attr(t, "data-src") ?? attr(t, "srcset")?.split(/\s+/)[0];
    if (!src || src.startsWith("data:")) continue;
    if (/logo/i.test([src, attr(t, "alt"), attr(t, "class"), attr(t, "id")].join(" "))) { const u = abs(src); if (u) out.push(u); }
  }
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const icons = links
    .map((t) => ({ rel: (attr(t, "rel") ?? "").toLowerCase(), href: attr(t, "href"), size: Number((attr(t, "sizes") ?? "").split("x")[0]) || 0 }))
    .filter((l) => l.href && /icon/.test(l.rel));
  icons.sort((a, b) => Number(b.rel.includes("apple")) - Number(a.rel.includes("apple")) || b.size - a.size);
  for (const l of icons) { const u = abs(l.href!); if (u) out.push(u); }
  // Social preview image: often the logo itself for small companies.
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const t = m[0];
    if (/(og:image|twitter:image)["']/i.test(t)) { const c = attr(t, "content"); const u = c && abs(c); if (u) out.push(u); }
  }
  const fav = abs("/favicon.ico");
  if (fav) out.push(fav);
  // Public logo services, for sites that block automated requests or offer no icon.
  out.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(base.hostname)}&sz=256`);
  out.push(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(base.hostname)}.ico`);
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
      // Skip empty files and the 16px "no icon" placeholders the logo services return.
      if (buf.length < 200 || buf.length > MAX_BYTES) continue;
      await db.deal.update({ where: { id: dealId }, data: { logo: buf, logoMime: mime, logoCheckedAt: new Date() } });
      return true;
    }
  } catch (err) {
    console.error("[logo] could not fetch", dealId, err);
  }
  await db.deal.update({ where: { id: dealId }, data: { logoCheckedAt: new Date() } }).catch(() => {});
  return false;
}

/** Normalises "https://www.Example.com/about" or "example.com" to "example.com". */
export function cleanDomain(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().replace(/^[<("']+|[>)"'.,;]+$/g, "");
  if (!t) return null;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

const NOT_COMPANY = /(^|\.)(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|aol|proton|protonmail|linkedin|twitter|x|facebook|instagram|youtube|google|apple|microsoft|github|medium|wikipedia|nih|ncbi|nlm|fda|ema|clinicaltrials|doi|sciencedirect|nature|springer|wiley|elsevier|pubmed|bit|tinyurl|calendly|zoom|docsend|dropbox|box|sharepoint|genesyscapital|mba27|w3|schema|adobe|canva|gov|gc)\.[a-z.]+$/i;

/**
 * The company's own domain, read straight from its materials: email addresses
 * and web links in the deck. Domains that mention the company's name win.
 */
export function websiteFromText(text: string | null | undefined, companyName: string): string | null {
  if (!text) return null;
  const counts = new Map<string, number>();
  const add = (raw: string, weight: number) => {
    const d = cleanDomain(raw);
    if (!d || NOT_COMPANY.test(d) || /\.(pdf|png|jpe?g|pptx?|docx?|xlsx?)$/i.test(d)) return;
    counts.set(d, (counts.get(d) ?? 0) + weight);
  };
  for (const m of text.matchAll(/[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi)) add(m[1], 3);
  for (const m of text.matchAll(/\b(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|bio|io|ai|co|health|care|ca|org|net|tech|med|life|science|us|uk|de|fr|ch|eu|com\.au|co\.uk))\b/gi)) add(m[1], 1);
  const token = companyName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  let best: string | null = null;
  let bestScore = 0;
  for (const [d, n] of counts) {
    const score = n + (token.length >= 3 && d.replace(/[^a-z0-9]/g, "").includes(token) ? 10 : 0);
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best ? `https://${best}` : null;
}
