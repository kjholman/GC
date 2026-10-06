/**
 * Seeds (1) the administrator allow-list, (2) the Genesys Capital portfolio
 * knowledge base and (3) the Training Studio deal archive.
 *
 * Portfolio facts (acquirer, exit date, exit value, entry round, board seat)
 * come from the "Current Investments" and exits sections of genesyscapital.com,
 * supplemented where noted by public filings and press. Seeded records are
 * refreshed on every deploy until a partner edits them; partner edits are never
 * overwritten.
 */
import { PrismaClient, type PortfolioOutcome } from "@prisma/client";
import { TEAM } from "../src/lib/team";

const db = new PrismaClient();

type Entry = {
  name: string;
  sector: string;
  modality?: string;
  indication?: string;
  description: string;
  yearInvested?: number;
  stageAtEntry?: string;
  outcome: PortfolioOutcome;
  outcomeNotes?: string;
  exitYear?: number;
  tags: string[];
  /** true when the key facts come from genesyscapital.com itself. */
  fromWebsite: boolean;
};

const WEBSITE = "Source: genesyscapital.com portfolio page.";

const PORTFOLIO: Entry[] = [
  // ── Realised investments (genesyscapital.com exits section) ──────────────
  {
    name: "Fusion Pharmaceuticals",
    sector: "Therapeutics",
    modality: "Radiopharmaceutical (targeted alpha therapy)",
    indication: "Solid tumours",
    description: "Spun out of McMaster University's Centre for Probe Development and Commercialization to develop targeted alpha-emitting radiopharmaceuticals.",
    stageAtEntry: "Series A (founding investor); board: Chairman",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by AstraZeneca, June 2024, for USD$2.4 billion. Earlier Nasdaq IPO (June 2020). ${WEBSITE}`,
    exitYear: 2024,
    tags: ["radiopharmaceutical", "oncology", "alpha-emitter", "mcmaster", "university-spinout", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Inversago Pharma",
    sector: "Therapeutics",
    modality: "Small molecule (peripherally restricted CB1 inverse agonist)",
    indication: "Obesity and metabolic disease",
    description: "Montreal company developing peripherally acting CB1 blockers designed to avoid the CNS side effects of first-generation CB1 drugs.",
    yearInvested: 2018,
    stageAtEntry: "Series A (lead investor); board: Director & Chairman (Compensation & Audit Committee)",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by Novo Nordisk, September 2023, for USD$1.1 billion. CVCA 2024 VC Deal of the Year. ${WEBSITE}`,
    exitYear: 2023,
    tags: ["small-molecule", "obesity", "metabolic", "cb1", "peripheral-restriction", "quebec"],
    fromWebsite: true,
  },
  {
    name: "Epocal",
    sector: "Diagnostics",
    modality: "Point-of-care blood analysis",
    indication: "Acute care blood gas and electrolyte testing",
    description: "Ottawa developer of the epoc handheld point-of-care blood analysis system.",
    stageAtEntry: "Series A (lead investor); board: Director",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by Alere Inc. (now Abbott Laboratories), February 2013, for USD$225 million. ${WEBSITE}`,
    exitYear: 2013,
    tags: ["diagnostics", "point-of-care", "blood-gas", "device", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Affinium Pharmaceuticals",
    sector: "Therapeutics",
    modality: "Small molecule (anti-infective)",
    indication: "Bacterial infections",
    description: "Toronto company developing novel antibiotics.",
    outcome: "ACQUIRED",
    outcomeNotes: `Clinical and preclinical assets and platform acquired by Debiopharm, February 2014; terms undisclosed. ${WEBSITE} Acquirer and date from Debiopharm announcement.`,
    exitYear: 2014,
    tags: ["small-molecule", "antibiotic", "anti-infective", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Invitae",
    sector: "Diagnostics",
    modality: "Genetic testing",
    description: "Genetic information company offering clinical genetic testing.",
    outcome: "IPO",
    outcomeNotes: `Public market exit: NYSE IPO, February 2015. ${WEBSITE}`,
    exitYear: 2015,
    tags: ["diagnostics", "genetic-testing", "genomics"],
    fromWebsite: true,
  },
  {
    name: "Naurex",
    sector: "Therapeutics",
    modality: "NMDA receptor modulators",
    indication: "Depression and CNS disorders",
    description: "Clinical-stage company developing NMDA receptor modulators for depression and other CNS disorders.",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by Allergan, August 2015: US$560 million upfront plus milestones. ${WEBSITE} Terms from Allergan's announcement.`,
    exitYear: 2015,
    tags: ["cns", "depression", "nmda", "neuroscience"],
    fromWebsite: true,
  },
  {
    name: "Aptinyx",
    sector: "Therapeutics",
    modality: "NMDA receptor modulators (small molecule)",
    indication: "Neurological and pain disorders",
    description: "Developer of NMDA receptor modulators, spun out of Naurex.",
    stageAtEntry: "Seed / Series A",
    outcome: "IPO",
    outcomeNotes: `Public market exit via IPO; divested (Nasdaq: APTX) 2018-2019. ${WEBSITE}`,
    exitYear: 2019,
    tags: ["cns", "pain", "nmda", "neuroscience", "small-molecule"],
    fromWebsite: true,
  },
  {
    name: "Delex Therapeutics",
    sector: "Therapeutics",
    modality: "Inhaled drug delivery",
    description: "Toronto drug-delivery company.",
    stageAtEntry: "Series A (lead investor); board: Director",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by YM Biosciences (now Gilead), May 2005; value undisclosed. ${WEBSITE}`,
    exitYear: 2005,
    tags: ["drug-delivery", "inhaled", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Xltek",
    sector: "Medical Devices",
    modality: "Neurodiagnostic monitoring systems",
    indication: "EEG and neurodiagnostics",
    description: "Ontario developer of neurodiagnostic monitoring equipment.",
    stageAtEntry: "Series A; board: Observer",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by Natus Medical, November 2007, for USD$44 million. ${WEBSITE}`,
    exitYear: 2007,
    tags: ["device", "neurodiagnostics", "eeg", "neurology", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Fairhaven Pharmaceuticals",
    sector: "Therapeutics",
    description: "Quebec therapeutics company backed by Genesys Ventures III.",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by Liminal BioSciences, July 2020 (reported CAD$8 million). ${WEBSITE} Value from transaction reports.`,
    exitYear: 2020,
    tags: ["therapeutics", "quebec"],
    fromWebsite: true,
  },
  {
    name: "IDbyDNA",
    sector: "Diagnostics",
    modality: "Metagenomic sequencing and analysis",
    indication: "Infectious disease diagnostics",
    description: "Metagenomics company using sequencing and analysis software to identify pathogens.",
    yearInvested: 2020,
    stageAtEntry: "Series B (US$20M round, January 2020)",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by Illumina, June 2022. ${WEBSITE}`,
    exitYear: 2022,
    tags: ["diagnostics", "genomics", "metagenomics", "infectious-disease", "software"],
    fromWebsite: true,
  },
  {
    name: "Ionalytics",
    sector: "Platform / Tools",
    modality: "Ion mobility (FAIMS) technology for mass spectrometry",
    description: "Ottawa developer of FAIMS ion-mobility technology for mass spectrometry.",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by Thermo Electron Corporation, August 2005. ${WEBSITE}`,
    exitYear: 2005,
    tags: ["tools", "mass-spectrometry", "analytical", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Millenium Biologix",
    sector: "Medical Devices",
    modality: "Bone graft substitutes (orthobiologics)",
    indication: "Bone repair",
    description: "Ontario orthobiologics company developing synthetic bone graft materials.",
    stageAtEntry: "Series A (lead investor); board: Director",
    outcome: "ACQUIRED",
    outcomeNotes: `Acquired by Medtronic, April 2007; value undisclosed. ${WEBSITE}`,
    exitYear: 2007,
    tags: ["device", "orthopaedics", "orthobiologics", "bone", "ontario"],
    fromWebsite: true,
  },
  {
    name: "SXC Health Solutions",
    sector: "Health IT",
    modality: "Pharmacy benefit and healthcare software",
    description: "Healthcare information technology company.",
    stageAtEntry: "PIPE",
    outcome: "IPO",
    outcomeNotes: `Public market: divested (TSX: SXC), 2003. ${WEBSITE}`,
    exitYear: 2003,
    tags: ["health-it", "software", "public-market"],
    fromWebsite: true,
  },
  {
    name: "Xillix Technologies",
    sector: "Medical Devices",
    modality: "Fluorescence endoscopy imaging",
    indication: "Early cancer detection",
    description: "Developer of fluorescence endoscopy imaging systems.",
    stageAtEntry: "PIPE",
    outcome: "IPO",
    outcomeNotes: `Public market: divested (TSX: XLX), 2004-2005. ${WEBSITE}`,
    exitYear: 2005,
    tags: ["device", "imaging", "endoscopy", "oncology", "public-market"],
    fromWebsite: true,
  },

  // ── Current investments (genesyscapital.com "Current Investments") ───────
  {
    name: "Adapsyn Bioscience",
    sector: "Therapeutics",
    modality: "Small-molecule natural products discovery platform (AI/genomics)",
    description: "Hamilton company mining microbial genomes with machine learning to discover natural-product drug candidates.",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["small-molecule", "natural-products", "ai", "platform", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Antegrade Medical",
    sector: "Medical Devices",
    modality: "Single-use interventional cardiology tools",
    indication: "Structural heart interventions",
    description: "Quebec company building tools for structural interventional cardiology.",
    yearInvested: 2025,
    stageAtEntry: "Seed (C$7.3M round, led by Sectoral)",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["device", "cardiology", "interventional", "structural-heart", "quebec"],
    fromWebsite: true,
  },
  {
    name: "BIOS Genomics",
    sector: "Diagnostics",
    modality: "Genomics",
    description: "Genomics company in the current Genesys portfolio. Details not yet recorded; a partner should complete this entry.",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["genomics"],
    fromWebsite: true,
  },
  {
    name: "CryoStasis",
    sector: "Platform / Tools",
    modality: "Sub-zero unfrozen preservation",
    indication: "Organ transplantation; cell and gene therapy logistics",
    description: "Ottawa company enabling sub-zero storage without ice formation for organs and cell therapies.",
    stageAtEntry: "Seed (lead investor, C$8M)",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["preservation", "transplant", "cell-therapy", "platform", "ontario"],
    fromWebsite: true,
  },
  {
    name: "EBT Medical",
    sector: "Medical Devices",
    modality: "Non-invasive neuromodulation",
    indication: "Overactive bladder and pelvic floor disorders",
    description: "Clinical-stage neuromodulation company targeting the saphenous nerve with a discreet, non-invasive therapy for overactive bladder.",
    yearInvested: 2019,
    stageAtEntry: "Series A (co-lead with SV Health Investors, US$10M); board: Jamie Stiff",
    outcome: "ACTIVE",
    outcomeNotes: `${WEBSITE} Round details from the November 2019 announcement.`,
    tags: ["device", "neuromodulation", "urology", "pelvic-health", "non-invasive"],
    fromWebsite: true,
  },
  {
    name: "Enspire DBS Therapy",
    sector: "Medical Devices",
    modality: "Implantable deep brain stimulation",
    indication: "Post-stroke motor rehabilitation",
    description: "Ohio company running the RESTORE pivotal trial of deep brain stimulation paired with rehabilitation for chronic stroke.",
    yearInvested: 2026,
    stageAtEntry: "Series B1 (lead investor, US$10.3M)",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["device", "neuromodulation", "dbs", "stroke", "neurology"],
    fromWebsite: true,
  },
  {
    name: "Feldan Therapeutics",
    sector: "Therapeutics",
    modality: "Intracellular delivery platform (peptide shuttle)",
    description: "Quebec City company whose Feldan Shuttle delivers proteins, gene-editing and other cargo into cells.",
    stageAtEntry: "Series B (co-lead with Fonds de solidarité FTQ, US$21M, 2024)",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["delivery", "platform", "peptide", "gene-editing", "quebec"],
    fromWebsite: true,
  },
  {
    name: "Flosonics Medical",
    sector: "Medical Devices",
    modality: "Wearable Doppler ultrasound (FloPatch)",
    indication: "Haemodynamic monitoring and fluid management",
    description: "Sudbury and Toronto company with a hands-free wireless Doppler patch for real-time blood-flow monitoring.",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["device", "ultrasound", "wearable", "monitoring", "critical-care", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Functional Neuromodulation",
    sector: "Medical Devices",
    modality: "Deep brain stimulation (fornix)",
    indication: "Alzheimer's disease",
    description: "Toronto company developing fornix deep brain stimulation for mild Alzheimer's disease; FDA Breakthrough Device designation.",
    stageAtEntry: "Seed",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["device", "neuromodulation", "dbs", "alzheimers", "neurology", "ontario"],
    fromWebsite: true,
  },
  {
    name: "Giiant Pharma",
    sector: "Therapeutics",
    modality: "Oral gut-restricted small molecules",
    indication: "Inflammatory bowel disease",
    description: "Montreal company developing gut-restricted anti-inflammatory therapeutics; CEO Dr. Maxime Ranger (Inversago co-founder).",
    yearInvested: 2021,
    stageAtEntry: "Seed (co-lead with Amplitude Ventures, US$11M)",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["small-molecule", "gut-restricted", "inflammation", "ibd", "quebec"],
    fromWebsite: true,
  },
  {
    name: "Profound Medical",
    sector: "Medical Devices",
    modality: "MRI-guided transurethral ultrasound ablation (TULSA-PRO)",
    indication: "Prostate disease",
    description: "Sunnybrook Research Institute technology commercialised as TULSA-PRO; publicly listed (TSX/Nasdaq) and listed by Genesys as a current investment.",
    outcome: "ACTIVE",
    outcomeNotes: WEBSITE,
    tags: ["device", "ultrasound", "mri-guided", "prostate", "oncology", "ontario"],
    fromWebsite: true,
  },

  // ── From other public sources; not confirmed on the website ──────────────
  {
    name: "Veralox Therapeutics",
    sector: "Therapeutics",
    modality: "Small molecule (12-LOX inhibitor VLX-1005)",
    indication: "Type 1 diabetes and immune-mediated disease",
    description: "U.S. company developing first-in-class 12-lipoxygenase inhibitors.",
    stageAtEntry: "Series A",
    outcome: "ACTIVE",
    outcomeNotes: "US$16.6M Series A (2021) and US$24M financing (2023). From press reports; not confirmed on genesyscapital.com.",
    tags: ["small-molecule", "diabetes", "immunology"],
    fromWebsite: false,
  },
  {
    name: "Questat",
    sector: "Diagnostics",
    modality: "Point-of-care blood analysis",
    description: "Point-of-care diagnostics company founded by Imants Lauks (founder of Epocal).",
    stageAtEntry: "Seed",
    outcome: "ACTIVE",
    outcomeNotes: "From press reports; not confirmed on genesyscapital.com.",
    tags: ["diagnostics", "point-of-care", "repeat-founder"],
    fromWebsite: false,
  },
];

/** Names seeded by earlier versions that should no longer be maintained. */
const RETIRED = ["Tioga Pharmaceuticals", "NeurAxon"];

async function main() {
  const admins = (process.env.SEED_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const email of admins) {
    await db.user.upsert({ where: { email }, create: { email, role: "ADMIN" }, update: { role: "ADMIN", active: true } });
  }
  const analysts = (process.env.SEED_ANALYST_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const email of analysts) {
    await db.user.upsert({ where: { email }, create: { email }, update: { active: true } });
  }

  // People on the sign-in page who have an address get access (an existing role is never changed).
  for (const m of TEAM) {
    if (!m.email) continue;
    await db.user.upsert({ where: { email: m.email }, create: { email: m.email, name: m.name }, update: { active: true } });
  }

  let portfolioWritten = 0;
  let archiveWritten = 0;
  for (const e of PORTFOLIO) {
    const record = {
      name: e.name,
      sector: e.sector,
      modality: e.modality ?? null,
      indication: e.indication ?? null,
      description: e.description,
      yearInvested: e.yearInvested ?? null,
      stageAtEntry: e.stageAtEntry ?? null,
      outcome: e.outcome,
      outcomeNotes: e.outcomeNotes ?? null,
      verified: e.fromWebsite,
      seeded: true,
    };
    const existing = await db.portfolioCompany.findUnique({ where: { name: e.name } });
    if (!existing) {
      await db.portfolioCompany.create({ data: record });
      portfolioWritten++;
    } else if (existing.seeded || (!existing.verified && existing.lessons == null)) {
      // Refresh seed-maintained records; keep any lessons a partner has written.
      await db.portfolioCompany.update({ where: { id: existing.id }, data: { ...record, lessons: existing.lessons } });
      portfolioWritten++;
    }

    // Training Studio deal archive: every Genesys investment is a precedent.
    const archive = {
      companyName: e.name,
      decision: "INVESTED" as const,
      decisionYear: e.yearInvested ?? null,
      decisionRationale: `Genesys invested${e.stageAtEntry ? ` (${e.stageAtEntry})` : ""}. Partners' original investment rationale not yet recorded; add it in the Training Studio.`,
      outcome: e.outcome,
      outcomeNotes: e.outcomeNotes ?? null,
      sector: e.sector,
      modality: e.modality ?? null,
      indication: e.indication ?? null,
      stage: e.stageAtEntry ?? null,
      tags: e.tags,
      digest: e.description,
      ingestStatus: "READY" as const,
      seeded: true,
    };
    const prior = await db.historicalDeal.findFirst({ where: { companyName: e.name } });
    if (!prior) {
      await db.historicalDeal.create({ data: archive });
      archiveWritten++;
    } else if (prior.seeded) {
      await db.historicalDeal.update({ where: { id: prior.id }, data: archive });
      archiveWritten++;
    }
  }

  // Retire superseded seed-only records (never ones a partner has touched).
  await db.portfolioCompany.deleteMany({ where: { name: { in: RETIRED }, verified: false, lessons: null } });

  console.log(
    `Seeded ${admins.length} admin(s), ${analysts.length} analyst(s); ${portfolioWritten} portfolio and ${archiveWritten} archive records written (${PORTFOLIO.length} companies).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
