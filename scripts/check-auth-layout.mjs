/* ============================================================ scripts/check-auth-layout.mjs

   Catches the auth card overflowing.

   Reported from a real phone: on the "check your email" step the highlighted
   box and the code field ran past the card's right edge. The cause is a
   CSS grid child with no `min-width: 0` — grid children default to their
   intrinsic width, and an <input> asks for 20 characters' worth, which at
   24px with wide letter-spacing is wider than a 428px card.

   That is invisible in a screenshot of the top of the page and invisible to
   every other check in this repo, so it gets its own.

   jsdom does not lay anything out, so this is arithmetic on the stylesheet
   and the markup rather than a measurement: it asserts the *defences* are
   present, and that the numbers they are defending against would otherwise
   overflow. A missing defence fails; the absence of a problem does not.

     node scripts/check-auth-layout.mjs
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const login = fs.readFileSync(path.join(root, 'dist/login/index.html'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, condition, detail = '') => {
  if (condition) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}${detail ? `  \x1b[90m${detail}\x1b[0m` : ''}`);
  }
};

/* The rule body, so a later rule cannot silently override the defence. */
const rule = (selector) => {
  const m = css.match(new RegExp(`\\n${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
};

console.log('\n  The login card fits its contents\n');

/* The card's own numbers, which the rest of this is measured against. */
const card = rule('.authcard');
const maxWidth = Number((card.match(/max-width:\s*(\d+)px/) || [])[1]);
const pad = Number((card.match(/padding:\s*clamp\((\d+)px/) || [])[1]);
const inner = maxWidth - pad * 2;

ok('the card has a width and a padding to reason about', maxWidth > 0 && pad > 0, `${maxWidth}px − 2×${pad}px = ${inner}px inside`);
ok('the card is not absurdly narrow', inner > 280, `${inner}px of usable width`);

/* --- the defences ------------------------------------------------------- */

ok(
  'the form is a grid that may be narrower than its contents',
  /grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)/.test(rule('.authform')),
  'minmax(0, 1fr) on .authform'
);

ok(
  'the input shell may shrink',
  /min-width:\s*0/.test(rule('.inputwrap')),
  'min-width: 0 on .inputwrap'
);

ok(
  'the "check your email" box may shrink',
  /min-width:\s*0/.test(rule('.authsent')),
  'min-width: 0 on .authsent'
);

ok(
  'a long address can wrap instead of stretching',
  /overflow-wrap:\s*anywhere|word-break:\s*break-word/.test(rule('.authsent__to')),
  'overflow-wrap on .authsent__to'
);

/* --- the numbers that made it overflow ---------------------------------- */

const code = rule('.field--code');
const codeSize = Number((code.match(/font-size:\s*(\d+)px/) || [])[1]) || 16;
const tracking = Number((code.match(/letter-spacing:\s*([\d.]+)em/) || [])[1]) || 0;

/* 20 characters is an <input>'s default intrinsic width; a monospace glyph is
   about 0.6em, plus the tracking. */
const naive = Math.round(20 * codeSize * (0.6 + tracking));
ok(
  'the code field no longer asks for its default 20 characters',
  /width:\s*100%/.test(code) || codeSize * 20 * (0.6 + tracking) < inner,
  `20 chars would want ~${naive}px against ${inner}px`
);

/* What the field actually contains. */
const sixChars = Math.round(6 * codeSize * (0.6 + tracking));
ok('six digits comfortably fit', sixChars < inner - 60, `~${sixChars}px of ${inner}px`);

/* --- the markup the rules apply to ------------------------------------- */

ok('the code field is inside the shell the rule targets', /class="inputwrap"[\s\S]{0,400}?class="field field--code"/.test(login));
ok('the "check your email" box is on the page', /class="authsent"/.test(login));
ok('the address has its own element, so it can wrap', /class="authsent__to"/.test(login));

/* The step-2 form must carry the form class, or the grid defence misses it. */
const verifyForm = (login.match(/<form class="([^"]*)" id="verifyForm"/) || [])[1] || '';
ok('the code step is a .authform, so it gets the grid defence', /\bauthtabpanel\b/.test(verifyForm) && /\bauthform\b/.test(verifyForm), verifyForm);

console.log(`\n  ${fail ? '\x1b[31m' : '\x1b[32m'}${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail ? 1 : 0);
