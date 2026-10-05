/**
 * Seeds (1) the administrator allow-list and (2) the Genesys Capital portfolio
 * knowledge base. Portfolio entries come from public sources (press releases,
 * SEC filings, genesyscapital.com) and are marked unverified until a partner
 * confirms them in-app under Knowledge Base.
 */
import { PrismaClient, type Prisma } from "@prisma/client";

const db = new PrismaClient();

const PORTFOLIO: Prisma.PortfolioCompanyCreateInput[] = [
  {
    name: "Fusion Pharmaceuticals",
    sector: "Therapeutics",
    modality: "Radiopharmaceutical (targeted alpha therapy)",
    indication: "Solid tumours",
    description: "McMaster Centre for Probe Development & Commercialization spin-out building targeted alpha-emitting radiopharmaceuticals. Genesys participated in the US$25M Series A alongside J&J, HealthCap, TPG and FACIT.",
    stageAtEntry: "Series A",
    outcome: "ACQUIRED",
    outcomeNotes: "Nasdaq IPO June 2020; acquired by AstraZeneca (closed June 2024) for US$21/share + US$3 CVR, ~US$2.4B.",
  },
  {
    name: "Inversago Pharma",
    sector: "Therapeutics",
    modality: "Small molecule (peripherally-restricted CB1 inverse agonist)",
    indication: "Obesity and metabolic disease",
    description: "Montreal company developing peripherally-acting CB1 blockers designed to avoid the CNS liabilities that sank rimonabant. Genesys led the C$7M Series A in 2018.",
    yearInvested: 2018,
    stageAtEntry: "Series A (lead)",
    outcome: "ACQUIRED",
    outcomeNotes: "Acquired by Novo Nordisk (announced Aug 2023) for up to US$1.075B (~US$600M upfront). CVCA 2024 VC Deal of the Year.",
  },
  {
    name: "Epocal",
    sector: "Diagnostics",
    modality: "Point-of-care blood gas / electrolyte analysis",
    indication: "Acute care testing",
    description: "Ottawa developer of the epoc handheld point-of-care blood analysis system. Early Genesys investment (2000).",
    yearInvested: 2000,
    outcome: "ACQUIRED",
    outcomeNotes: "Acquired by Alere (2013) for up to US$255M; Alere later acquired by Abbott.",
  },
  {
    name: "Profound Medical",
    sector: "Medical Devices",
    modality: "MRI-guided transurethral ultrasound ablation",
    indication: "Prostate disease",
    description: "Sunnybrook Research Institute technology commercialised as TULSA-PRO. Genesys held ~23% at the 2015 reverse-takeover listing.",
    stageAtEntry: "Early",
    outcome: "IPO",
    outcomeNotes: "TSXV listing via RTO June 2015 (later Nasdaq/TSX); Genesys exit recorded around 2020.",
  },
  {
    name: "Invitae",
    sector: "Diagnostics",
    modality: "Genetic testing",
    description: "Genetic information company; Genesys was an early investor.",
    outcome: "IPO",
    outcomeNotes: "NYSE IPO February 2015 raising ~US$102M.",
  },
  {
    name: "Feldan Therapeutics",
    sector: "Therapeutics",
    modality: "Intracellular delivery platform (peptide shuttle)",
    description: "Quebec City company whose Feldan Shuttle delivers proteins, gene-editing and other cargo into cells.",
    stageAtEntry: "Series B (co-lead)",
    outcome: "ACTIVE",
    outcomeNotes: "Genesys co-led the US$21M Series B with Fonds de solidarité FTQ (Sept 2024).",
  },
  {
    name: "Giiant Pharma",
    sector: "Therapeutics",
    modality: "Oral gut-restricted small molecules",
    indication: "Inflammatory bowel disease",
    description: "Montreal company developing gut-restricted anti-inflammatory therapeutics; CEO Dr. Maxime Ranger (Inversago co-founder).",
    yearInvested: 2021,
    stageAtEntry: "Seed (co-lead)",
    outcome: "ACTIVE",
    outcomeNotes: "Genesys co-led the US$11M seed with Amplitude Ventures (May 2021).",
  },
  {
    name: "Veralox Therapeutics",
    sector: "Therapeutics",
    modality: "Small molecule (12-LOX inhibitor VLX-1005)",
    indication: "Type 1 diabetes / immune-mediated disease",
    description: "U.S. company developing first-in-class 12-lipoxygenase inhibitors.",
    stageAtEntry: "Series A",
    outcome: "ACTIVE",
    outcomeNotes: "US$16.6M Series A (2021) and US$24M financing (2023).",
  },
  {
    name: "Flosonics Medical",
    sector: "Medical Devices",
    modality: "Wearable Doppler ultrasound (FloPatch)",
    indication: "Haemodynamic monitoring / fluid management",
    description: "Sudbury/Toronto company with a hands-free wireless Doppler patch for real-time blood-flow monitoring.",
    outcome: "ACTIVE",
    outcomeNotes: "Participated in US$14M (2021) and US$20M Series C (2024, led by New Leaf).",
  },
  {
    name: "Functional Neuromodulation",
    sector: "Medical Devices",
    modality: "Deep brain stimulation (fornix)",
    indication: "Alzheimer's disease",
    description: "Toronto company developing fornix DBS for mild Alzheimer's disease; FDA Breakthrough Device designation. Seed with Genesys; C$10.4M financing with Medtronic (2011).",
    stageAtEntry: "Seed",
    outcome: "ACTIVE",
  },
  {
    name: "Enspire DBS Therapy",
    sector: "Medical Devices",
    modality: "Implantable deep brain stimulation",
    indication: "Post-stroke motor rehabilitation",
    description: "Ohio company running the RESTORE pivotal trial of DBS paired with rehabilitation for chronic stroke.",
    yearInvested: 2026,
    stageAtEntry: "Series B1 (lead)",
    outcome: "ACTIVE",
    outcomeNotes: "Genesys led the US$10.3M Series B1 (Jan 2026).",
  },
  {
    name: "Antegrade Medical",
    sector: "Medical Devices",
    modality: "Single-use interventional cardiology tools",
    indication: "Structural heart interventions",
    description: "Quebec company building tools for structural interventional cardiology.",
    yearInvested: 2025,
    stageAtEntry: "Seed",
    outcome: "ACTIVE",
    outcomeNotes: "Participated in the C$7.3M seed led by Sectoral (Oct 2025).",
  },
  {
    name: "Adapsyn Bioscience",
    sector: "Therapeutics",
    modality: "Small-molecule natural products discovery platform (AI/genomics)",
    description: "Hamilton company mining microbial genomes with machine learning to discover natural-product drug candidates. Financing alongside Pfizer R&D Innovate (2018).",
    yearInvested: 2018,
    outcome: "ACTIVE",
  },
  {
    name: "CryoStasis",
    sector: "Platform / Tools",
    modality: "Sub-zero unfrozen preservation",
    indication: "Organ transplantation; cell and gene therapy logistics",
    description: "Ottawa company enabling sub-zero storage without ice formation for organs and cell therapies. Genesys led the C$8M seed.",
    stageAtEntry: "Seed (lead)",
    outcome: "ACTIVE",
  },
  {
    name: "Questat",
    sector: "Diagnostics",
    modality: "Point-of-care blood analysis",
    description: "Point-of-care diagnostics company founded by Imants Lauks (founder of Epocal).",
    stageAtEntry: "Seed",
    outcome: "ACTIVE",
  },
  {
    name: "NeurAxon",
    sector: "Therapeutics",
    modality: "Small molecule (nNOS inhibitors)",
    indication: "Pain and migraine",
    description: "Toronto company developing nNOS inhibitors; Genesys participated in the C$32M Series B (2007).",
    yearInvested: 2007,
    stageAtEntry: "Series B",
    outcome: "UNKNOWN",
    outcomeNotes: "Assets later partnered with Knight Therapeutics; outcome for Genesys not public.",
  },
  {
    name: "Tioga Pharmaceuticals",
    sector: "Therapeutics",
    modality: "Small molecule (asimadoline, kappa-opioid agonist)",
    indication: "Irritable bowel syndrome",
    description: "Late-stage in-licensed asset; Genesys participated in the Series A and the 2012 US$10M Series B.",
    stageAtEntry: "Series A",
    outcome: "UNKNOWN",
  },
];

async function main() {
  const admins = (process.env.SEED_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of admins) {
    await db.user.upsert({ where: { email }, create: { email, role: "ADMIN" }, update: { role: "ADMIN", active: true } });
  }
  const analysts = (process.env.SEED_ANALYST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of analysts) {
    await db.user.upsert({ where: { email }, create: { email }, update: { active: true } });
  }
  for (const company of PORTFOLIO) {
    await db.portfolioCompany.upsert({ where: { name: company.name }, create: company, update: {} });
  }
  console.log(`Seeded ${admins.length} admin(s), ${analysts.length} analyst(s), ${PORTFOLIO.length} portfolio companies.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
