CREATE TABLE "FundingStage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "scope" TEXT NOT NULL DEFAULT 'CORE',
    "role" TEXT,
    "cheque" TEXT,
    "roundSize" TEXT,
    "valuation" TEXT,
    "ownership" TEXT,
    "entryEvidence" TEXT,
    "milestones" TEXT,
    "redFlags" TEXT,
    "notes" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundingStage_pkey" PRIMARY KEY ("id")
);

-- Starting values for an early-stage Canadian life-science fund, unconfirmed until a partner saves each one.
INSERT INTO "FundingStage" ("id","name","position","scope","role","cheque","roundSize","valuation","ownership","entryEvidence","milestones","redFlags","notes") VALUES
('stage_preseed','Pre-seed',1,'SELECTIVE','Lead or co-lead, often alongside university, accelerator or non-dilutive funding','Up to ~C$1M (often from the University Seed Fund)','C$0.5M-C$2M','C$3M-C$8M pre-money','10-20%','Novel science with reproducible early data from a credible lab; a clear first indication or use; IP filed or being filed; a founder or scientific lead committed to the company','Proof-of-concept data, key IP filed, a first full-time leader in place, and a plan for the seed round','No IP strategy; science not reproduced outside one lab; no committed founder; a plan that needs more than this round to show anything',NULL),
('stage_seed','Seed',2,'CORE','Lead or co-lead','C$1M-C$3M','C$2M-C$6M','C$6M-C$15M pre-money','15-25%','In vivo or clinical-grade proof of concept (therapeutics), or a working prototype with early user validation (devices and diagnostics); a defined lead program; IP filed; a core team','Lead candidate or design frozen, IND-enabling or regulatory plan underway, and data that supports a Series A','Round too small to reach a value inflection; valuation set ahead of the data; heavy dependence on one unproven partner; a cap table with too little room for future investors',NULL),
('stage_a','Series A',3,'CORE','Lead, co-lead or meaningful participant alongside a specialist investor','C$3M-C$5M','C$10M-C$40M','C$20M-C$60M pre-money','10-20%','A lead asset ready for IND-enabling studies or first-in-human (therapeutics), or regulatory submission planned (devices and diagnostics); a full-time CEO; at least one credible co-investor','First clinical data, regulatory clearance or first revenue, enough to raise a Series B on stronger terms','A syndicate with no specialist investor; a burn rate that does not reach the milestone; a valuation the next round can''t step up from; key hires still missing',NULL),
('stage_b','Series B',4,'SELECTIVE','Follow-on for portfolio companies; new positions only with a strong lead investor','Follow-on reserves; new positions rarely above C$5M','C$30M-C$100M','C$60M-C$200M pre-money','Protect pro-rata; new positions 3-8%','Clinical data or regulatory clearance; a clear path to pivotal studies or commercial launch; a strong specialist lead','Pivotal data, approval or commercial scale-up, ahead of an exit or IPO','Genesys cannot influence the outcome at this size; terms that disadvantage earlier investors; a round that only extends the runway',NULL),
('stage_c','Series C and later',5,'OUT','Follow-on only, to protect existing positions','Follow-on reserves only','C$75M+','Set by late-stage specialist investors','Pro-rata only','Only for existing portfolio companies','Approval, commercial scale, an exit or IPO','A new position at this stage is outside the mandate',NULL);
