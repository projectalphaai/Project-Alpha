import crypto from "crypto";
import { config } from "../config.js";

/**
 * Minimal transactional mailer.
 * - If RESEND_API_KEY set: send via Resend API
 * - Else: log to console (dev) and return { ok: true, delivered: false }
 */
export async function sendEmail({ to, subject, text, html }) {
  const apiKey = config.email.resendApiKey;
  const from = config.email.from;

  if (!apiKey) {
    console.log(`[mailer:dev] to=${to} subject=${subject}\n${text}`);
    return { ok: true, delivered: false, provider: "console" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html: html || undefined
    })
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Email send failed: ${body.slice(0, 200)}`);
    err.status = 502;
    throw err;
  }

  return { ok: true, delivered: true, provider: "resend" };
}

export function createToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}
