/**
 * The people shown on the sign-in page. A person without an email address is
 * listed but can't sign in yet. Photos go in public/team/<id>.jpg (or .png/.webp).
 * Emails stay on the server: the page only ever sends the person's id.
 */
export type TeamMember = { id: string; name: string; fullName: string; title: string; email: string | null };

export const TEAM: TeamMember[] = [
  { id: "sarah", name: "Sarah", fullName: "Sarah Farr", title: "Principal", email: null },
  { id: "jamie", name: "Jamie", fullName: "Jamie Stiff", title: "Managing Director", email: null },
  { id: "damien", name: "Damian", fullName: "Damian Lamb", title: "Co-founder, Managing Director", email: null },
  { id: "kelly", name: "Kelly", fullName: "Kelly Holman", title: "Co-founder, Managing Director", email: "kelly@genesyscapital.com" },
  { id: "jen", name: "Jen", fullName: "Jennifer Williams", title: "Partner and Chief Financial Officer", email: null },
  { id: "lori", name: "Laurie", fullName: "Laurie Mak", title: "Associate", email: null },
  { id: "steph", name: "Steph", fullName: "Stephanie Legere", title: "Associate", email: null },
];
