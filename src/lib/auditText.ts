import type { AuditLog } from "@prisma/client";

/**
 * Turns audit-log entries into plain-English sentences for the Administration page.
 * `who` is the person's display name; `names` resolves deal/user ids to readable names.
 */
export function describeEvent(
  log: Pick<AuditLog, "action" | "entity" | "entityId" | "meta">,
  who: string | null,
  names: Record<string, string>,
): { text: string; warning: boolean } {
  const meta = (log.meta && typeof log.meta === "object" ? log.meta : {}) as Record<string, unknown>;
  const actor = who ?? "Someone";
  const subject = (log.entityId ? names[log.entityId] : undefined) ?? (typeof meta.name === "string" ? meta.name : undefined);
  const deal = subject ? `“${subject}”` : "a deal";
  const person = subject ?? "a team member";
  const email = typeof meta.email === "string" ? meta.email : "an unknown address";
  const roles: Record<string, string> = { ANALYST: "Analyst", PARTNER: "Partner", ADMIN: "Administrator" };
  const stages: Record<string, string> = {
    SCREENING: "Screening", PENDING_INFO: "Pending information", DILIGENCE: "Due diligence", IC_REVIEW: "IC review",
    INVESTED: "Invested", REJECTED: "Declined", ARCHIVED: "Archived",
  };
  const verdicts: Record<string, string> = { AGREE: "agreed with it", TOO_OPTIMISTIC: "found it too optimistic", TOO_PESSIMISTIC: "found it too pessimistic", WRONG_DECISION: "disagreed with the decision" };

  const t = (text: string, warning = false) => ({ text, warning });
  switch (log.action) {
    // Sign-in
    case "auth.code_sent": return t(`${actor} requested a sign-in code`);
    case "auth.signed_in": return t(`${actor} signed in`);
    case "auth.signed_in_with_link": return t(`${actor} signed in with a sign-in link`);
    case "auth.signed_out": return t(`${actor} signed out`);
    case "auth.admin_bypass_used": return t(`${actor} entered using the testing shortcut`, true);
    case "auth.code_invalid": return t(`Someone entered a wrong sign-in code for ${email}`, true);
    case "auth.code_rejected_domain": return t(`A sign-in attempt from ${email} was blocked (not a Genesys Capital address)`, true);
    case "auth.code_rejected_not_allowlisted": return t(`A sign-in attempt from ${email} was blocked (this person hasn't been given access)`, true);
    case "auth.link_invalid": return t("Someone tried to use a sign-in link that had expired or was already used", true);
    // Team access
    case "admin.users_added": {
      const list = Array.isArray(meta.emails) ? (meta.emails as string[]) : [];
      return t(`${actor} gave access to ${list.length ? list.join(", ") : "new people"}${typeof meta.role === "string" ? ` as ${roles[meta.role] ?? meta.role}` : ""}`);
    }
    case "admin.user_updated": return t(`${actor} updated ${person}'s details${typeof meta.role === "string" ? ` (access level: ${roles[meta.role] ?? meta.role})` : ""}`);
    case "admin.user_revoked": return t(`${actor} removed access for ${person}`, true);
    case "admin.user_reactivated": return t(`${actor} restored access for ${person}`);
    case "admin.sign_in_link_created": return t(`${actor} created a sign-in link for ${person}`);
    // Deals
    case "deal.created": return t(`${actor} uploaded a new deck: ${deal}`);
    case "deal.follow_up": return t(`${actor} added new information to ${deal} and started a new analysis`);
    case "deal.status_changed":
      return t(`${actor} moved ${deal} from ${stages[String(meta.from)] ?? "its previous stage"} to ${stages[String(meta.to)] ?? "a new stage"}`);
    case "deal.logo_changed": return t(`${actor} changed the logo for ${deal}`);
    case "deal.deleted": return t(`${actor} deleted a deal`, true);
    case "document.removed": return t(`${actor} removed the file ${subject ?? "from a deal"}; it won't be used in analyses`, true);
    case "document.downloaded": return t(`${actor} opened a document${subject ? ` (${subject})` : ""}`);
    case "analysis.stopped": return t(`${actor} stopped an analysis of ${deal} before it finished`);
    case "admin.credit_checked": return t(`${actor} checked the Anthropic credit balance (${meta.ok ? "credit available" : "out of credit or unreachable"})`, !meta.ok);
    case "analysis.signed_off": return t(`${actor} signed off a memo${subject ? ` for ${deal}` : ""}`);
    case "analysis.feedback": return t(`${actor} reviewed a memo and ${verdicts[String(meta.verdict)] ?? "left feedback"}`);
    // Knowledge base & training
    case "portfolio.created": return t(`${actor} added ${subject ?? "a company"} to the knowledge base`);
    case "portfolio.updated": return t(`${actor} updated ${subject ?? "a company"} in the knowledge base`);
    case "portfolio.deleted": return t(`${actor} removed ${subject ?? "a company"} from the knowledge base`, true);
    case "knowledge.files_added": {
      const n = Array.isArray(meta.changes) ? meta.changes.length : 1;
      return t(`${actor} added ${n} file${n === 1 ? "" : "s"} to ${subject ?? "the knowledge base"}`);
    }
    case "knowledge.suggestion_accepted": return t(`${actor} accepted a suggestion: ${typeof meta.name === "string" ? meta.name : "update"}${typeof meta.source === "string" ? ` (from ${meta.source})` : ""}`);
    case "knowledge.note_added": return t(`${actor} told GAIA: ${typeof meta.name === "string" ? meta.name.replace(/^Note: /, "") : "a note"}`);
    case "knowledge.undone": return t(`${actor} undid a change: ${typeof meta.name === "string" ? meta.name.replace(/^Undid: /, "") : ""}`.trim());
    case "knowledge.imported": return t(`${actor} imported ${typeof meta.name === "string" ? meta.name : "a spreadsheet"}`);
    case "knowledge.file_removed": return t(`${actor} removed the file ${subject ?? ""}`.trim(), true);
    case "knowledge.file_downloaded": return t(`${actor} downloaded ${subject ?? "a knowledge base file"}`);
    case "principle.created": return t(`${actor} added the principle “${subject ?? "untitled"}”`);
    case "principle.updated": return t(`${actor} edited the principle “${subject ?? "untitled"}”`);
    case "principle.toggled": return t(`${actor} ${meta.active ? "turned on" : "turned off"} the principle “${subject ?? "untitled"}”`, !meta.active);
    case "training.archive_added": return t(`${actor} added a past deal to the deal archive`);
    case "training.archive_imported": return t(`${actor} imported ${typeof meta.rows === "number" ? meta.rows : "several"} past deals into the archive`);
    case "training.archive_deleted": return t(`${actor} removed ${subject ?? "a past deal"} from past deals`, true);
    case "training.archive_retried": return t(`${actor} asked GAIA to read ${subject ?? "a past deal"} again`);
    case "training.exemplar_toggled": return t(`${actor} ${meta.active ? "started using" : "stopped using"} the example memo “${subject ?? "untitled"}”`, !meta.active);
    case "training.exemplar_saved": return t(`${actor} saved a corrected memo as an example to follow`);
    case "training.suggestions_generated": return t(`${actor} asked GAIA to suggest new principles`);
    case "training.suggestion_accepted": return t(`${actor} adopted the suggested principle “${subject ?? "untitled"}”`);
    case "training.suggestion_dismissed": return t(`${actor} dismissed the suggested principle “${subject ?? "untitled"}”`);
    case "training.backtest_started": return t(`${actor} started a test against past decisions`);
    case "training.firm_settings_saved": return t(`${actor} updated the firm's investment parameters`);
    case "training.dataset_exported": return t(`${actor} downloaded the training data`);
    default: return t(`${actor}: ${log.action.replace(/[._]/g, " ")}`);
  }
}
