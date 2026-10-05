import { db } from "../db";

/**
 * Firm parameters the partners control from Training Studio → Prompt & parameters.
 * Defaults are reasonable starting points for a Canadian early-stage life-science
 * fund and are flagged "unconfirmed" in the UI until a partner saves them.
 */
export const FIRM_SETTINGS = [
  {
    key: "initialCheque",
    label: "Typical initial cheque",
    help: "Size of Genesys' first investment in a company.",
    default: "C$1M-C$5M from the main fund; up to ~C$1M from the Genesys University Seed Fund.",
  },
  {
    key: "ownershipTarget",
    label: "Ownership target",
    help: "Fully diluted ownership Genesys aims for after its first round.",
    default: "15-25% fully diluted after the first round, protected through pro-rata participation.",
  },
  {
    key: "reserves",
    label: "Follow-on reserves",
    help: "How much is held back for follow-on rounds relative to the first cheque.",
    default: "Roughly 1:1 to 2:1 reserves to initial cheque for companies that hit milestones.",
  },
  {
    key: "returnHurdle",
    label: "Return hurdle",
    help: "Minimum return profile to advance a deal.",
    default: "Base case ≥5× gross MOIC on Genesys capital; a credible bull case that could return a meaningful share of the fund.",
  },
  {
    key: "mandate",
    label: "Mandate boundaries",
    help: "Stages, sectors and geographies in and out of scope.",
    default:
      "In scope: therapeutics, medical devices, diagnostics and enabling platforms from pre-seed to Series A (follow-ons later). Canadian companies or substantive Canadian science/IP/team; selective U.S. Out of scope: services businesses, generics, cosmetics/wellness, pure software/digital-health without a regulated product.",
  },
  {
    key: "screeningBar",
    label: "Screening bar",
    help: "What it takes for a deck to earn partner time.",
    default:
      "Genesys advances only a small fraction of inbound decks to diligence. Advance only when the science is compelling, the plan reaches a value inflection on realistic capital, and Genesys can play a lead or co-lead role.",
  },
  {
    key: "voice",
    label: "House style for founder correspondence",
    help: "Tone for emails to founders.",
    default:
      "Direct, courteous and brief, as a partner writes to a founder they respect. Canadian English spelling. Specific about why. No flattery or exclamation marks. Never mention internal scores, AI, or other companies under review.",
  },
] as const;

export type FirmSettingKey = (typeof FIRM_SETTINGS)[number]["key"];

export async function getFirmSettings() {
  const rows = await db.firmSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r]));
  return FIRM_SETTINGS.map((s) => ({
    ...s,
    value: map.get(s.key)?.value ?? s.default,
    confirmed: map.has(s.key),
    updatedAt: map.get(s.key)?.updatedAt ?? null,
  }));
}
