/** Feedback options shown to reviewers; shared by the form, the server action and the prompts. */
export const FEEDBACK_AREAS = [
  { group: "Science and data", options: [
    { id: "science_overrated", label: "Overrated the science or data" },
    { id: "science_underrated", label: "Underrated the science or data" },
    { id: "missed_scientific_risk", label: "Missed a scientific, clinical or regulatory risk" },
  ] },
  { group: "Market", options: [
    { id: "market_too_high", label: "Market size or peak sales too high" },
    { id: "market_too_low", label: "Market size or peak sales too low" },
    { id: "pricing_reimbursement", label: "Wrong view on pricing or reimbursement" },
  ] },
  { group: "Competition and IP", options: [
    { id: "missed_competitor", label: "Missed an important competitor" },
    { id: "misjudged_competition", label: "Misjudged the competition" },
    { id: "ip_misjudged", label: "Misjudged the patents or IP" },
  ] },
  { group: "Team", options: [
    { id: "team_too_generous", label: "Too generous on the team" },
    { id: "team_too_harsh", label: "Too harsh on the team" },
  ] },
  { group: "Deal and fit", options: [
    { id: "terms_misjudged", label: "Valuation or round terms misjudged" },
    { id: "capital_underestimated", label: "Underestimated how much capital it needs" },
    { id: "fit_wrong", label: "Wrong on fit with the Genesys mandate" },
    { id: "ignored_principle", label: "Ignored a Genesys principle" },
  ] },
  { group: "The write-up", options: [
    { id: "factual_error", label: "Factual error" },
    { id: "wrong_info_requests", label: "Asked founders for the wrong things" },
    { id: "email_tone", label: "Founder email tone or content wrong" },
    { id: "too_generic", label: "Too long, generic or unfocused" },
  ] },
] as const;

export const FEEDBACK_AREA_IDS: string[] = FEEDBACK_AREAS.flatMap((g) => g.options.map((o) => o.id));
export const FEEDBACK_AREA_LABEL: Record<string, string> = Object.fromEntries(FEEDBACK_AREAS.flatMap((g) => g.options.map((o) => [o.id, o.label])));
