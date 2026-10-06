/**
 * The people shown on the sign-in page. A person without an email address is
 * listed but can't sign in yet. Photos go in public/team/<id>.jpg (or .png/.webp).
 * Emails stay on the server: the page only ever sends the person's id.
 */
export type TeamMember = { id: string; name: string; fullName: string; title: string; email: string | null; admin?: boolean };

export const TEAM: TeamMember[] = [
  { id: "sarah", name: "Sarah", fullName: "Sarah Farr", title: "Principal", email: null },
  { id: "jamie", name: "Jamie", fullName: "Jamie Stiff", title: "Managing Director", email: null, admin: true },
  { id: "damien", name: "Damian", fullName: "Damian Lamb", title: "Co-founder, Managing Director", email: null, admin: true },
  { id: "kelly", name: "Kelly", fullName: "Kelly Holman", title: "Co-founder, Managing Director", email: "kelly@genesyscapital.com", admin: true },
  { id: "jen", name: "Jen", fullName: "Jennifer Williams", title: "Partner and Chief Financial Officer", email: null },
  { id: "lori", name: "Laurie", fullName: "Laurie Mak", title: "Associate", email: null },
  { id: "steph", name: "Steph", fullName: "Stephanie Legere", title: "Associate", email: null },
  { id: "christine", name: "Christine", fullName: "Christine", title: "", email: null },
];

/**
 * Access is fixed here, not edited in the app: Jamie, Damian and Kelly see
 * Administration; everyone else gets full deal, knowledge base and Training
 * Studio access without it.
 */
export function roleForEmail(email: string): "ADMIN" | "PARTNER" {
  const e = email.trim().toLowerCase();
  return TEAM.some((m) => m.admin && m.email?.toLowerCase() === e) ? "ADMIN" : "PARTNER";
}
