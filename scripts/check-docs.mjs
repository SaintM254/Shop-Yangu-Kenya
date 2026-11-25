/* ============================================================ scripts/check-docs.mjs

   Checks the guides in docs/ hold together.

   These files are the only instructions most people will ever get, so a broken
   link or a link to a heading that does not exist is a dead end for a
   non-developer with no way to recover. Both are invisible when reading the
   Markdown on GitHub, which renders a broken relative link as plain text.

   GitHub's heading rules are mirrored here: lower-case, punctuation stripped,
   spaces to hyphens (spaces are NOT collapsed, so "Step 4 · Add" becomes
   "step-4--add" — the double hyphen is real).

   Run it after any edit to docs/:

     node scripts/check-docs.mjs
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'docs');

const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') /* punctuation out */
    .trim()
    .replace(/ /g, '-'); /* every space becomes a hyphen, not runs of them */

const anchorsOf = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const out = new Set();

  /* Both headings and the ids people write by hand. */
  for (const m of text.matchAll(/^#{1,6}\s+(.+)$/gm)) out.add(slug(m[1]));
  for (const m of text.matchAll(/<a\s+(?:name|id)="([^"]+)"/g)) out.add(m[1]);

  return out;
};

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
const cache = new Map();
const anchors = (f) => {
  if (!cache.has(f)) cache.set(f, anchorsOf(path.join(dir, f)));
  return cache.get(f);
};

let broken = 0;
let badAnchors = 0;
let links = 0;

for (const file of files) {
  const text = fs.readFileSync(path.join(dir, file), 'utf8');

  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];

    /* Skip anything that is not a file in this folder: web addresses, bare
       anchors, and mail. */
    if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue;
    links++;

    const [name, hash] = target.split('#');
    const resolved = path.join(dir, name);

    if (!fs.existsSync(resolved)) {
      console.log(`  \x1b[31m✗ ${file}\x1b[0m → ${target}  \x1b[90m(no such file)\x1b[0m`);
      broken++;
      continue;
    }

    if (hash && !anchors(name).has(hash.toLowerCase())) {
      console.log(`  \x1b[31m✗ ${file}\x1b[0m → ${target}  \x1b[90m(no such heading)\x1b[0m`);
      badAnchors++;
    }
  }
}

/* Every guide must be reachable from the index, or nobody will find it.

   The one exception is the forwarding stubs left at the old filenames, so an
   old bookmark still lands somewhere. They are reachable by definition — that
   is their whole job — and are recognised by their title. */
const forwards = new Set(
  files.filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').startsWith('# This guide has moved'))
);

const index = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
const orphans = files.filter(
  (f) =>
    f !== 'README.md' &&
    !forwards.has(f) &&
    !index.includes(`(${f})`) &&
    !index.includes(`(${f}#`)
);

const problems = broken + badAnchors + orphans.length;

console.log('');
console.log(
  `  ${files.length} files · ${links} links · ` +
    `${problems ? `\x1b[31m${broken} broken, ${badAnchors} bad headings, ${orphans.length} unreachable\x1b[0m` : '\x1b[32mall links resolve\x1b[0m'}`
);
if (orphans.length) console.log(`  unreachable from README.md: ${orphans.join(', ')}`);
console.log('');

process.exit(problems ? 1 : 0);
