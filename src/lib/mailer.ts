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
  const subject = `${code} is your Sharminator sign-in code`;
  const text = [
    `Your Sharminator sign-in code is: ${code}`,
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
        <div style="color:#29a2b5;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.2em;margin-top:6px;">THE SHARMINATOR</div>
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
