/**
 * House style enforcement. Genesys correspondence and memos must read like
 * they were written by an experienced investment professional, not a chatbot.
 * The prompt sets the standard; this module enforces the mechanical parts on
 * every string the model returns.
 */

/** Phrases that mark text as machine-written or as consultant filler. */
export const BANNED_PHRASES = [
  "delve", "tapestry", "in today's", "ever-evolving", "ever-changing", "landscape of", "it's worth noting", "it is worth noting",
  "it's important to note", "it is important to note", "game-changing", "game changer", "revolutionary", "cutting-edge",
  "groundbreaking", "unlock", "unleash", "seamless", "synergy", "paradigm", "holistic", "navigate the", "embark",
  "i hope this email finds you well", "i hope this finds you well", "i hope you are well", "rest assured", "don't hesitate",
  "do not hesitate", "please feel free", "we are thrilled", "we're thrilled", "excited to", "exciting opportunity",
  "testament to", "underscores", "a myriad", "plethora", "furthermore,", "moreover,", "in conclusion", "in summary,",
  "as an ai", "language model",
];

/** Replace em/en dashes and other typographic tells with plain business punctuation. */
export function plainPunctuation(text: string): string {
  return text
    // Numeric ranges: "5–10", "C$1M–C$5M" → hyphen.
    .replace(/(\d[\d.,]*\s*[%A-Za-z$]*)\s*[–—]\s*(?=[A-Z]{0,2}\$?\d)/g, "$1-")
    // Parenthetical or clause dashes → comma.
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/…/g, "...")
    .replace(/\s+,/g, ",");
}

/** Deeply apply plainPunctuation to every string in a JSON-like value. */
export function sanitizeStrings<T>(value: T): T {
  if (typeof value === "string") return plainPunctuation(value) as T;
  if (Array.isArray(value)) return value.map(sanitizeStrings) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeStrings(v)])) as T;
  }
  return value;
}

export function findBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}
