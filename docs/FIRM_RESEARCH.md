# Genesys Capital: research notes behind the platform

These notes were compiled from public sources in October 2026: genesyscapital.com, Business Wire releases, SEC filings and trade press. They seed the analyst's firm profile (`src/lib/ai/prompts.ts`) and the portfolio knowledge base (`prisma/seed.ts`). Everything here should be **confirmed by the partnership**. Portfolio records are marked *unverified* in the app until a partner checks them.

## Firm
- **Legal names:** Genesys Capital Partners Inc. / Genesys Capital Management Inc.
- **Office:** 123 Front Street West, Suite 1503, Toronto. Website: genesyscapital.com. **Email domain: @genesyscapital.com.**
- **Founded:** 2000, by **Damian Lamb** and **Kelly Holman**. Both previously worked at MDS Capital.
- **Positioning:** "Canada's most successful life sciences venture firm". Over 20 exits; more than $400M raised across its funds.
- **Model:** "Co-creation": thought partners to scientific founders, drawing on the Toronto–Hamilton–Montreal research corridor.
- **Stage:** Pre-seed to Series A, with follow-on support. Typically leads or co-leads.
- **Sectors:** Biotech/therapeutics and medtech.

### Funds
| Fund | Notes |
|---|---|
| Genesys Ventures I / IA / II | BDC was an LP in Fund II (2007) |
| Genesys Ventures III | 2016; $90M first close from 14 LPs, including HarbourVest |
| Genesys Ventures IV | 2025; the firm's largest fund. LPs: BDC Capital, EDC, FTQ, HarbourVest, RBC, Teralys, Venture Ontario, VCCI |
| Genesys University Seed Fund | 2026; first close over $30M. Backers: U of T, McMaster, Venture Ontario, Temerty, RBC |

### Team (public website)
| Name | Role | Education |
|---|---|---|
| Damian Lamb | Co-founder & MD | MSc neuroscience; MBA |
| Kelly Holman | Co-founder & MD | BSc biochemistry; MBA |
| Jamie Stiff | MD | BSc; MBA |
| Jennifer Williams | Partner & CFO | — |
| Lisa Low | SVP Finance | — |
| Sarah Farr | Principal | PhD, U of T Medicine |
| Dr. Maxime Ranger | GP, Fund IV | Inversago co-founder |

### Notable outcomes
- **Fusion Pharmaceuticals:** acquired by AstraZeneca, June 2024, for about US$2.4B.
- **Inversago:** acquired by Novo Nordisk for up to US$1.075B; CVCA 2024 Deal of the Year. Genesys led the Series A.
- **Epocal:** acquired by Alere for up to US$255M.
- **Profound Medical:** reverse-takeover listing in 2015.
- **Invitae:** NYSE IPO in 2015.

## Branding
The firm's website and stylesheets could not be fetched from the build environment, so official colours, typefaces and the logo were **not available**. The platform therefore uses an institutional palette defined as tokens in `src/app/globals.css`: deep navy, warm ivory and a champagne accent, with Newsreader and Inter type. The wordmark in `src/components/Logo.tsx` is a placeholder.

To apply the official identity:
1. Replace the `--color-*` tokens with the brand hex values.
2. Put the logo SVG in `public/brand/` and render it from `Logo.tsx`.
3. Swap the fonts in `src/app/layout.tsx` if the brand specifies typefaces.
