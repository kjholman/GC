/** Centralised, validated access to server configuration. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const env = {
  get authSecret() {
    const secret = required("AUTH_SECRET");
    if (process.env.NODE_ENV === "production" && secret.length < 32) {
      throw new Error("AUTH_SECRET must be at least 32 characters in production");
    }
    return secret;
  },
  /** Comma-separated list of email domains that may ever be allow-listed. */
  get allowedDomains(): string[] {
    return (process.env.ALLOWED_EMAIL_DOMAINS ?? "genesyscapital.com")
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
  },
  /** Cheaper model for mechanical steps: reading decks into a dossier, web research, table extraction, feedback lessons. */
  get anthropicFastModel() {
    return process.env.ANTHROPIC_FAST_MODEL ?? "claude-sonnet-5-5";
  },
  get analysisEffort(): "low" | "medium" | "high" | "xhigh" | "max" {
    const v = process.env.ANALYSIS_EFFORT ?? "medium";
    return (["low", "medium", "high", "xhigh", "max"].includes(v) ? v : "medium") as
      "low" | "medium" | "high" | "xhigh" | "max";
  },
  get webResearchEnabled() {
    return (process.env.ENABLE_WEB_RESEARCH ?? "true") !== "false";
  },
  /**
   * TEMPORARY testing aid: shows a "Continue as administrator" button on the
   * sign-in page. Off unless ENABLE_ADMIN_BYPASS=true; also switches itself
   * off after ADMIN_BYPASS_UNTIL (YYYY-MM-DD) if that is set.
   */
  get adminBypassEnabled() {
    if (process.env.ENABLE_ADMIN_BYPASS !== "true") return false;
    const until = process.env.ADMIN_BYPASS_UNTIL;
    if (until && !Number.isNaN(Date.parse(until)) && Date.now() > Date.parse(until) + 24 * 3600 * 1000) return false;
    return true;
  },
  /** Session length in hours (default 7 days, so sign-in links are rarely needed). */
  get sessionTtlHours() {
    const h = Number(process.env.SESSION_TTL_HOURS ?? 168);
    return Number.isFinite(h) && h > 0 ? Math.min(h, 24 * 90) : 168;
  },
  /** Resend (https://resend.com) API key: sends sign-in codes over HTTPS, no SMTP server. */
  get resendApiKey() {
    return process.env.RESEND_API_KEY || null;
  },
  smtp: {
    get host() { return process.env.SMTP_HOST; },
    get port() { return Number(process.env.SMTP_PORT ?? 587); },
    get user() { return process.env.SMTP_USER; },
    get pass() { return process.env.SMTP_PASS; },
    get from() { return process.env.EMAIL_FROM ?? "The Sharminator <no-reply@genesyscapital.com>"; },
  },
};

export function isAllowedDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && env.allowedDomains.includes(domain);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
