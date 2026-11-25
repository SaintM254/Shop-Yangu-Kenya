/* ============================================================ api/_lib/sql-split.js

   Split a .sql file into statements.

   Needed by the migration runner and the seed script, because the Neon HTTP
   driver takes a list of statements and a naive split on ";" breaks every
   function body — the bodies in 002 are full of semicolons inside $$ … $$.

   This walks the text and cuts only at a semicolon that is outside:

     · a dollar-quoted block   $$ … $$  or  $name$ … $name$
     · a string literal        'it''s fine'
     · a line comment          -- …
     · a block comment         slash-star … star-slash

   It is not a SQL parser and does not pretend to be. It is enough for files
   we write ourselves, and it is tested against every file in db/.
*/

/* Split a SQL file into statements.

   Needed because the http driver takes a list of statements, and a naive
   split on ";" breaks every function body (they contain semicolons inside
   $$ ... $$). This walks the text, tracks dollar-quoted blocks and string
   literals, and cuts only at a top-level semicolon. */
export function splitStatements(text) {
  const out = [];
  let buf = '';
  let i = 0;
  let dollar = null; /* the current $tag$ open, e.g. "$$" or "$fn$" */
  let inString = false;
  let inLineComment = false;

  while (i < text.length) {
    const c = text[i];
    const rest = text.slice(i);
    const next = text[i + 1];

    if (inLineComment) {
      buf += c;
      if (c === '\n') inLineComment = false;
      i++;
      continue;
    }

    if (!inString && !dollar && c === '-' && next === '-') {
      inLineComment = true;
      buf += c;
      i++;
      continue;
    }

    if (!inString && !dollar && c === '/' && next === '*') {
      /* block comment: copy through to the closing marker */
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      buf += text.slice(i, stop);
      i = stop;
      continue;
    }

    if (dollar) {
      if (rest.startsWith(dollar)) {
        buf += dollar;
        i += dollar.length;
        dollar = null;
        continue;
      }
      buf += c;
      i++;
      continue;
    }

    if (inString) {
      buf += c;
      if (c === "'" ) {
        if (next === "'") {
          buf += next;
          i += 2;
          continue;
        }
        inString = false;
      }
      i++;
      continue;
    }

    if (c === "'") {
      inString = true;
      buf += c;
      i++;
      continue;
    }

    if (c === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(rest);
      if (m) {
        dollar = m[0];
        buf += dollar;
        i += dollar.length;
        continue;
      }
    }

    if (c === ';') {
      const statement = buf.trim();
      if (statement && !/^[\s-]*$/.test(statement)) out.push(statement + ';');
      buf = '';
      i++;
      continue;
    }

    buf += c;
    i++;
  }

  const tail = buf.trim();
  if (tail && !/^[\s-]*$/.test(tail)) out.push(tail);
  return out;
}
