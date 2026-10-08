import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let transporter: Transporter | null = null;

function getTransport() {
  if (!env.smtp.host) return null;
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

/** Whether sign-in codes can be emailed. Without it, admins issue sign-in links instead. */
export function emailDeliveryConfigured(): boolean {
  return !!env.resendApiKey || !!env.smtp.host || process.env.NODE_ENV !== "production" || process.env.MAIL_TRANSPORT === "console";
}

/** Resend's HTTPS API: no mail server to run, just an API key and a verified sending domain. */
async function sendViaResend(msg: { to: string; subject: string; text: string; html: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.smtp.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
}

export async function sendLoginCode(to: string, code: string) {
  const subject = `${code} is your GAIA sign-in code`;
  const text = [
    `Your GAIA sign-in code is: ${code}`,
    "",
    "This code expires in 10 minutes and can be used once.",
    "If you did not request it, you can safely ignore this email.",
    "",
    "Genesys Capital",
  ].join("\n");
  const spaced = code.split("").join("&#8202;");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f8fa;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dbe5e9;">
      <tr><td style="background:#15354f;padding:28px 40px;">
        <div style="color:#ffffff;font-size:22px;font-weight:600;">Genesys <span style="font-weight:400;">Capital</span></div>
        <div style="color:#29a2b5;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.2em;margin-top:6px;">GAIA</div>
      </td></tr>
      <tr><td style="padding:40px;">
        <p style="font-family:Helvetica,Arial,sans-serif;color:#3d4451;font-size:15px;margin:0 0 24px;">Use the code below to sign in. It expires in 10 minutes.</p>
        <div style="font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;letter-spacing:0.35em;color:#15354f;background:#f0f7f9;border:1px solid #dbe5e9;padding:20px 0;text-align:center;">${spaced}</div>
        <p style="font-family:Helvetica,Arial,sans-serif;color:#7a808c;font-size:12px;margin:28px 0 0;line-height:1.6;">If you didn't request this code, no action is needed. Access to this system is restricted to authorised Genesys Capital personnel and is logged.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;

  if (env.resendApiKey) {
    await sendViaResend({ to, subject, text, html });
    return;
  }

  const transport = getTransport();
  if (!transport) {
    // MAIL_TRANSPORT=console prints codes to the server log (local testing only).
    if (process.env.NODE_ENV === "production" && process.env.MAIL_TRANSPORT !== "console") {
      throw new Error("SMTP is not configured; cannot deliver sign-in codes");
    }
    console.info(`\n[dev-mail] Sign-in code for ${to}: ${code}\n`);
    return;
  }
  await transport.sendMail({ from: env.smtp.from, to, subject, text, html });
}

/** Sends one email by whichever route is configured: Resend, then SMTP, then the server log (testing). */
async function deliver(msg: { to: string; subject: string; text: string; html: string }) {
  if (env.resendApiKey) return sendViaResend(msg);
  const transport = getTransport();
  if (transport) {
    await transport.sendMail({ from: env.smtp.from, ...msg });
    return;
  }
  if (process.env.NODE_ENV === "production" && process.env.MAIL_TRANSPORT !== "console") return; // no email set up: skip quietly
  console.info(`\n[dev-mail] To ${msg.to}: ${msg.subject}\n${msg.text}\n`);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f3f8fa;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dbe5e9;">
      <tr><td style="background:#15354f;padding:24px 36px;">
        <div style="color:#ffffff;font-size:20px;font-weight:600;">Genesys <span style="font-weight:400;">Capital</span></div>
        <div style="color:#29a2b5;font-size:11px;letter-spacing:0.2em;margin-top:6px;">GAIA</div>
      </td></tr>
      <tr><td style="padding:32px 36px;color:#17374d;font-size:14.5px;line-height:1.6;">
        <h1 style="margin:0 0 16px;font-size:20px;color:#15354f;">${esc(title)}</h1>
        ${bodyHtml}
        <p style="color:#668296;font-size:12px;margin:28px 0 0;">Confidential. For Genesys Capital personnel only.</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export type AnalysisReadyEmail = {
  to: string;
  firstName: string;
  companyName: string;
  version: number;
  url: string;
  recommendation: string;
  score: number;
  headline: string;
  summary: string;
  gaps: { gap: string; priority: string }[];
  factCheck: string;
};

/** "Your analysis of X is ready", with the headline, key gaps and a link to the full memo. */
export async function sendAnalysisReady(e: AnalysisReadyEmail) {
  const subject = `${e.companyName}: analysis ${e.version > 1 ? `version ${e.version} ` : ""}is ready (${e.recommendation})`;
  const critical = e.gaps.filter((g) => g.priority === "CRITICAL");
  const text = [
    `Hi ${e.firstName},`,
    "",
    `GAIA has finished ${e.version > 1 ? `version ${e.version} of ` : ""}its analysis of ${e.companyName}.`,
    "",
    `Recommendation: ${e.recommendation} (score ${e.score}/100)`,
    `Fact-check: ${e.factCheck}`,
    "",
    e.headline,
    "",
    e.summary,
    ...(critical.length ? ["", "Critical gaps to close:", ...critical.map((g) => `- ${g.gap}`)] : []),
    "",
    `Open the full memo: ${e.url}`,
  ].join("\n");
  const html = shell(
    `${e.companyName} is ready for review`,
    `<p style="margin:0 0 16px;">Hi ${esc(e.firstName)}, GAIA has finished ${e.version > 1 ? `version ${e.version} of ` : ""}its analysis.</p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
       <td style="padding:10px 16px;background:#f0f7f9;border:1px solid #dbe5e9;"><div style="font-size:11px;color:#668296;letter-spacing:0.12em;">RECOMMENDATION</div><div style="font-size:16px;font-weight:600;color:#15354f;">${esc(e.recommendation)}</div></td>
       <td style="padding:10px 16px;background:#f0f7f9;border:1px solid #dbe5e9;border-left:none;"><div style="font-size:11px;color:#668296;letter-spacing:0.12em;">SCORE</div><div style="font-size:16px;font-weight:600;color:#15354f;">${e.score}/100</div></td>
       <td style="padding:10px 16px;background:#f0f7f9;border:1px solid #dbe5e9;border-left:none;"><div style="font-size:11px;color:#668296;letter-spacing:0.12em;">FACT-CHECK</div><div style="font-size:14px;color:#15354f;">${esc(e.factCheck)}</div></td>
     </tr></table>
     <p style="margin:0 0 10px;font-weight:600;">${esc(e.headline)}</p>
     <p style="margin:0 0 18px;color:#3d5566;">${esc(e.summary)}</p>
     ${critical.length ? `<p style="margin:0 0 6px;font-weight:600;color:#b4372b;">Critical gaps to close</p><ul style="margin:0 0 18px;padding-left:18px;color:#3d5566;">${critical.map((g) => `<li>${esc(g.gap)}</li>`).join("")}</ul>` : ""}
     <a href="${esc(e.url)}" style="display:inline-block;background:#15354f;color:#ffffff;text-decoration:none;padding:12px 22px;font-weight:600;border-radius:8px;">Open the full memo</a>`,
  );
  await deliver({ to: e.to, subject, text, html });
}

/** Short note when an analysis someone started could not finish. */
export async function sendAnalysisProblem(to: string, firstName: string, companyName: string, url: string, reason: string) {
  const subject = `${companyName}: the analysis needs attention`;
  const text = `Hi ${firstName},\n\nGAIA could not finish its analysis of ${companyName}.\n\n${reason}\n\nOpen the deal: ${url}`;
  const html = shell(`${companyName} needs attention`, `<p style="margin:0 0 14px;">Hi ${esc(firstName)}, GAIA could not finish its analysis.</p><p style="margin:0 0 18px;color:#3d5566;">${esc(reason)}</p><a href="${esc(url)}" style="display:inline-block;background:#15354f;color:#ffffff;text-decoration:none;padding:12px 22px;font-weight:600;border-radius:8px;">Open the deal</a>`);
  await deliver({ to, subject, text, html });
}
