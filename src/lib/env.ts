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
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get anthropicModel() {
    return process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
  },
  get analysisEffort(): "low" | "medium" | "high" | "xhigh" | "max" {
    const v = process.env.ANALYSIS_EFFORT ?? "high";
    return (["low", "medium", "high", "xhigh", "max"].includes(v) ? v : "high") as
      "low" | "medium" | "high" | "xhigh" | "max";
  },
  get webResearchEnabled() {
    return (process.env.ENABLE_WEB_RESEARCH ?? "true") !== "false";
  },
  smtp: {
    get host() { return process.env.SMTP_HOST; },
    get port() { return Number(process.env.SMTP_PORT ?? 587); },
    get user() { return process.env.SMTP_USER; },
    get pass() { return process.env.SMTP_PASS; },
    get from() { return process.env.EMAIL_FROM ?? "Genesys Analyst <no-reply@genesyscapital.com>"; },
  },
};

export function isAllowedDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && env.allowedDomains.includes(domain);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
