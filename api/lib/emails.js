/* ============================================================ api/lib/emails.js

   What the four emails say.

   Rules, from the shop's own brief:
     · the code or link is the biggest thing in the message, because a phone
       on a bad connection should not have to scroll;
     · plain words, no jargon, no "click here to validate your identity";
     · the text version is written first and the HTML is built from the same
       strings, so the two can never drift apart;
     · every message says who it is for and how long it lasts, so a worried
       shopkeeper can tell a real email from a phishing one.
*/

import { env } from './config.js';

const brand = 'Shop Yangu Kenya';
const legal = 'Ksh 1,500 a month · Nairobi, Kenya';

const shell = (title, intro, block, footer) => `
<!doctype html>
<html lang="en-KE"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#F4F6F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#23313A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F7;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #E3E8EA;">
        <tr><td style="padding:22px 26px 0;">
          <p style="margin:0;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#287094;font-weight:700;">${brand}</p>
          <h1 style="margin:8px 0 0;font-size:21px;line-height:1.3;font-weight:700;">${title}</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.55;color:#4A5A64;">${intro}</p>
        </td></tr>
        <tr><td style="padding:20px 26px 0;">${block}</td></tr>
        <tr><td style="padding:20px 26px 26px;">
          <p style="margin:0;font-size:13px;line-height:1.55;color:#7A8892;">${footer}</p>
          <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#9AA6AD;">${legal}</p>
        </td></tr>
      </table>
      <p style="max-width:520px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#9AA6AD;text-align:center;">
        You are receiving this because someone used this address to sign in to ${brand}.
        If that was not you, ignore this email — nothing has changed.
      </p>
    </td></tr>
  </table>
</body></html>`;

const codeBlock = (code) => `
  <div style="border:1px solid #E3E8EA;border-radius:12px;background:#F7FAFB;padding:18px;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#7A8892;font-weight:600;">Your sign-in code</p>
    <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;line-height:1.1;letter-spacing:.16em;font-weight:700;color:#1B4A63;">${code}</p>
  </div>`;

const buttonBlock = (href, label) => `
  <div style="text-align:center;">
    <a href="${href}" style="display:inline-block;background:#287094;color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:13px 24px;border-radius:10px;">${label}</a>
    <p style="margin:14px 0 0;font-size:12px;line-height:1.5;color:#7A8892;word-break:break-all;">
      Or paste this into your browser:<br/><span style="color:#287094;">${href}</span>
    </p>
  </div>`;

/* -------------------------------------------------------------------------
   Sign-up: the first email a shop ever gets.
   It carries both — a code and a link — because the brief asked for both and
   because one of them will fail on a bad connection.
   ------------------------------------------------------------------------- */

export function signupEmail({ code, link, shopName, personName, minutes }) {
  const subject = `${code} is your ${brand} code`;
  const text = [
    `Karibu, ${personName}.`,
    '',
    `Your sign-in code for ${shopName} is ${code}.`,
    `It works for the next ${minutes} minutes, once.`,
    '',
    'Or open this link and you are in:',
    link,
    '',
    'If you did not ask to open a shop, ignore this email and nothing happens.',
    '',
    `— ${brand}`,
  ].join('\n');

  const html = shell(
    `Karibu, ${personName}`,
    `Here is the code that opens <strong>${esc(shopName)}</strong>. It works once, for ${minutes} minutes.`,
    codeBlock(code) +
      `<p style="margin:18px 0 12px;font-size:14px;line-height:1.55;color:#4A5A64;text-align:center;">In a hurry? This link signs you in instead:</p>` +
      buttonBlock(link, 'Open my shop'),
    'The link is good for 30 minutes. After that, ask for a new one on the sign-in page.'
  );

  return { to: null, subject, text, html };
}

/* Sign-in for an account that already exists. */
export function signinEmail({ code, link, shopName, personName, minutes }) {
  const subject = `${code} is your ${brand} sign-in code`;
  const text = [
    `Hello ${personName},`,
    '',
    `Your sign-in code for ${shopName} is ${code}.`,
    `It works for the next ${minutes} minutes, once.`,
    '',
    'Or open this link:',
    link,
    '',
    'If this was not you, no one can get in without the code. You can ignore this email.',
    '',
    `— ${brand}`,
  ].join('\n');

  const html = shell(
    `Your sign-in code`,
    `For <strong>${esc(shopName)}</strong>. It works once, for ${minutes} minutes.`,
    codeBlock(code) +
      `<p style="margin:18px 0 12px;font-size:14px;line-height:1.55;color:#4A5A64;text-align:center;">Or sign in with this link:</p>` +
      buttonBlock(link, 'Sign in to my shop'),
    'If this was not you, ignore this email. Without the code or the link, nobody can sign in.'
  );

  return { to: null, subject, text, html };
}

/* The super admin's sign-in. Same mechanism, a different door. */
export function adminSigninEmail({ code, link, personName, minutes }) {
  const subject = `${code} is your ${brand} admin code`;
  const text = [
    `Hello ${personName},`,
    '',
    `Your platform admin sign-in code is ${code}.`,
    `It works for the next ${minutes} minutes, once.`,
    '',
    'Or open this link:',
    link,
    '',
    `— ${brand} platform`,
  ].join('\n');

  const html = shell(
    'Platform admin code',
    `This code signs you in to the ${brand} console. It works once, for ${minutes} minutes.`,
    codeBlock(code) +
      `<p style="margin:18px 0 12px;font-size:14px;line-height:1.55;color:#4A5A64;text-align:center;">Or use this link:</p>` +
      buttonBlock(link, 'Open the console'),
    'This console is not for shop owners. If you did not ask for this, ignore the email.'
  );

  return { to: null, subject, text, html };
}

/* Sent once, after the first successful sign-in, so the shop has a record. */
export function welcomeEmail({ shopName, personName }) {
  const app = env.SITE_URL.replace(/\/$/, '');
  const subject = `${shopName} is open for business`;
  const text = [
    `Karibu, ${personName}.`,
    '',
    `${shopName} is set up. Your receipts will be numbered from S-0001,`,
    'prices include VAT, and every sale is saved the moment it is made.',
    '',
    'Where to start:',
    '  1. Add your products — Stock, then "Add a product".',
    '  2. Import your old spreadsheet if you have one — Import records.',
    '  3. Add your M-Pesa till — Settings, so prompts go out from your number.',
    '  4. Make a test sale — the till.',
    '',
    `Open the shop: ${app}/dashboard/`,
    '',
    `— ${brand}`,
  ].join('\n');

  const html = shell(
    'Your shop is open',
    `<strong>${esc(shopName)}</strong> is set up. Receipts are numbered from S-0001 and every sale is saved the moment it is made.`,
    `<ol style="margin:0;padding-left:18px;font-size:14px;line-height:1.9;color:#4A5A64;">
       <li>Add your products — <strong>Stock</strong></li>
       <li>Bring in your old spreadsheet — <strong>Import records</strong></li>
       <li>Add your M-Pesa till — <strong>Settings</strong></li>
       <li>Make one test sale — <strong>the till</strong></li>
     </ol>
     <div style="margin-top:20px;">${buttonBlock(`${app}/dashboard/`, 'Open my shop')}</div>`,
    'Keep this email: it is the record that the account exists.'
  );

  return { to: null, subject, text, html };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
