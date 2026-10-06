/**
 * The people shown on the sign-in page. A person without an email address is
 * listed but can't sign in yet. Photos go in public/team/<id>.jpg (or .png/.webp).
 * Emails stay on the server: the page only ever sends the person's id.
 */
export type TeamMember = { id: string; name: string; email: string | null };

export const TEAM: TeamMember[] = [
  { id: "sarah", name: "Sarah", email: null },
  { id: "jamie", name: "Jamie", email: null },
  { id: "damien", name: "Damien", email: null },
  { id: "kelly", name: "Kelly", email: "kelly@genesyscapital.com" },
  { id: "jen", name: "Jen", email: null },
  { id: "lori", name: "Lori", email: null },
  { id: "steph", name: "Steph", email: null },
];
