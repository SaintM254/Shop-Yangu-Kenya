/* ============================================================ api/_lib/mail.js

   Two drivers, one interface.

     console  writes the message to the server log. Development and tests.
     smtp     sends it, over TLS or STARTTLS. Production.

   The messages themselves live in ./emails.js, because "what the email says"
   and "how the email travels" change for different reasons.
*/

import { env } from './config.js';

let transport = null;

async function smtpTransport() {
  if (transport) return transport;
  const nodemailer = (await import('nodemailer')).default;

  transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    /* Kenyan connections drop idle TLS; a short timeout gives a clear error
       instead of a request that hangs until the browser gives up. */
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return transport;
}

/* ------------------------------------------------------------------------ */

/* In development the console driver also keeps the last few messages, so an
   automated test (and the /api/dev/inbox route below) can read a code without
   scraping the log. Never populated in production: the driver there is smtp. */
export const devInbox = [];

export async function sendMail({ to, subject, text, html, replyTo }) {
  if (env.EMAIL_DRIVER === 'console' || !env.SMTP_HOST) {
    /* Print enough that a developer can finish the sign-in flow from the
       terminal without an inbox. */
    const line = '─'.repeat(64);
    console.log(
      `\n${line}\n  ✉  ${subject}\n  to: ${to}\n${line}\n` +
        text
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n') +
        `\n${line}\n`
    );
    devInbox.unshift({ to, subject, text, at: new Date().toISOString() });
    if (devInbox.length > 50) devInbox.pop();
    return { driver: 'console', id: null };
  }

  const t = await smtpTransport();
  const info = await t.sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    html,
    replyTo,
  });
  return { driver: 'smtp', id: info.messageId };
}

/* Ask the mail server whether it is reachable, without sending anything.
   /api/health reports this so a deployment problem is visible. */
export async function mailHealth() {
  if (env.EMAIL_DRIVER !== 'smtp' || !env.SMTP_HOST) {
    return { driver: 'console', ok: true, note: 'codes are printed to the server log' };
  }
  try {
    const t = await smtpTransport();
    await t.verify();
    return { driver: 'smtp', ok: true, host: env.SMTP_HOST };
  } catch (err) {
    return { driver: 'smtp', ok: false, error: err.message };
  }
}
