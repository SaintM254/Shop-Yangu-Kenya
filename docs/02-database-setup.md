# 2 · Put the tables in

**Time:** 10 minutes · **Cost:** free · **You need:** the two strings from
[step 1](01-neon.md), and [the repository](https://github.com/SaintM254/Shop-Yangu-Kenya)
open in a browser tab

An empty database is a blank notebook. This step writes the headings in it:
tables for shops, products, sales, customers, and the rules that make them work
together. Then, optionally, it fills in a demo shop so you have something to
look at.

You have two ways to do it. **Pick one.** They do the same thing.

- **Way A — copy and paste.** Nothing to install. Use this if you are not sure.
- **Way B — one command.** If you have a terminal and are comfortable there.

---

## Before you start

From [step 1](01-neon.md) you saved two strings. You need the one **without**
`-pooler` in it, the one you labelled `DATABASE_DIRECT`. It is the only one
that can build tables.

> **Why the fussy one?** The other string is built to handle many short
> conversations at once, which is right for a busy website. Building tables is
> one long careful job, and it needs the plain connection. Get it the wrong way
> round and you get a confusing error mentioning "prepared statement" or
> "transaction".

---

## Way A · Copy and paste

### Step 1 · Open the file

The instructions that build the tables are in one file in the repository:

**`db/apply-all.sql`**

1. Open the repository in a browser:
   <https://github.com/SaintM254/Shop-Yangu-Kenya>
2. Click **`db`**, then click **`apply-all.sql`**.
3. Click the **copy** icon at the top right of the file — the two overlapping
   squares. (If you see a "Download raw file" arrow instead, use that and open
   the file in any plain text editor, then select all and copy.)

> **Do not** copy the text by dragging with the mouse. It is 66 kB, about 1500
> lines, and it is very easy to miss the beginning or the end. Use the copy
> button.

### Step 2 · Paste it into Neon

1. Go to <https://console.neon.tech> and click your `shop-yangu` project.
2. In the left sidebar, click **SQL Editor**.
3. Click into the big empty box.
4. Paste.
5. Click **Run** (some versions say **Execute**).

Nothing happens for a second or two — it is a big file. Then the Run button
goes quiet and you get a message.

### Step 3 · Read what it says

You are looking for one of these:

| What you see | What it means |
|---|---|
| **Success**, or **APPLIED** | Done. Go to step 4. |
| `Already applied — nothing to do` | You ran it before. Nothing to fix. Go to step 4. |
| Anything with the word **error** | Stop. See ["If it does not work"](#if-it-does-not-work) below. |

> **Why "already applied" is not an error.** The file checks first whether it
> has run before, and if it has, it stops. So pressing Run twice, or being
> interrupted and starting again, cannot break anything.

### Step 4 · Optional: a shop to look at

You can skip this if you are setting up a real shop. Most people run it,
because an empty dashboard tells you nothing about whether things work.

1. Back in the repository's `db` folder, open **`apply-demo.sql`**.
2. Copy the whole file, same as before.
3. Back in Neon's SQL Editor, **select everything in the box and delete it
   first**, then paste.
4. Click **Run**.

This creates one shop — **Shop Yangu Kenya**, in Mombasa — with 20 products,
6 customers, 4 suppliers and fourteen days of trading. Its owner signs in as
`demo@shopyangu.co.ke`.

> **Deleting the demo later:** run these three lines in the SQL Editor, in
> this order. The first and last switch off the audit log's protection for a
> moment, because the audit log refuses to be deleted from — that rule is there
> on purpose, to stop a shop erasing its own history.
>
> ```sql
> alter table audit_entries disable trigger audit_entries_no_update;
> delete from shops where name = 'Shop Yangu Kenya';
> alter table audit_entries enable trigger audit_entries_no_update;
> ```
>
> Run all three or none: leaving the first line run without the third leaves
> the audit log editable.

### Step 5 · Check it worked

Still in the SQL Editor, **clear the box**, paste this, and press Run:

```sql
select (select count(*) from shops)    as shops,
       (select count(*) from products) as products,
       (select count(*) from sales)    as sales;
```

You should get a small table back:

| shops | products | sales |
|---|---|---|
| 1 | 20 | 263 |

The numbers may differ slightly — the demo shop varies its trading a little.
What matters is that **shops is 1** and sales is a number in the hundreds, not
zero.

If you skipped step 4, you will get `0, 0, 0`. That is also correct.

---

## Way B · One command

If you have the repository on your computer and a terminal, this does the same
thing. You need Node.js installed (version 22 or newer) — type
`node --version` to check.

```bash
# in the repository folder
cd api
cp .env.example .env      # then open api/.env and fill in the two lines below
```

Open `api/.env` in any text editor and set:

```
DATABASE_URL=<paste the string WITHOUT -pooler here>
TOKEN_PEPPER=<paste 64 random characters here>
```

For the pepper, run this once and copy what it prints:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then:

```bash
cd ..                     # back to the repository root
npm install               # once
node scripts/build-sql.js # writes the three apply-*.sql files
npm run test:sql          # proves them against a real database
node scripts/db-migrate.js --seed
```

The last command prints a green tick per file and ends with something like
`4 applied`. You can then check your work the same way as in Way A, step 5.

> **What is `TOKEN_PEPPER`?** A long random secret the server uses to scramble
> sign-in tokens so a stolen database cannot be used to sign in as anyone. It
> has to be long and random, and it has to stay the same — changing it signs
> everybody out. You will also paste it into Vercel in the next step.

---

## ✅ Success looks like this

- [ ] `apply-all.sql` reported **Success** or **APPLIED**.
- [ ] The check query returns one shop, 20 products and a few hundred sales —
      or three zeros if you skipped the demo shop.
- [ ] Nothing in the Neon console is showing red.

---

## If it does not work

**"syntax error at or near ..."**
The paste got truncated. Copy again with the copy button in the top-right of
the file, not by dragging. In the SQL editor, select all and delete *before*
pasting, or you will paste into leftover text and produce a syntax error.

**"cannot insert multiple commands into a prepared statement"**
You are pasting into the wrong kind of box. Use **SQL Editor** in the left
sidebar, not a "query" box inside another tool.

**"relation \"shops\" already exists" or "policy ... already exists"**
The file got pasted in two halves, so its own "have I run already?" check
never saw the first half finish. The database is now in a half-built state.
The clean fix:

1. In the SQL Editor, run: `drop schema public cascade; create schema public;`
2. Paste and run `apply-all.sql` again, once, with the copy button.

That throws away everything in this database — which is fine, this is a new one.

**"password authentication failed"**
The string was copied with something missing from the front or the back. Copy
it again from Connection Details.

**`SSL required` or `connection is insecure`**
You copied the string but lost the `?sslmode=require` on the end. Copy again.

**"I don't see a SQL Editor."**
It is in the left sidebar of the Neon console, inside your project — not on the
dashboard, and not inside Connection Details.

**Way B: `No DATABASE_URL`**
`api/.env` does not exist or is empty. Run `cp .env.example .env` from inside
`api/` first. The file must be called `.env` exactly — no `.txt` on the end.

---

Next: **[3 · Put the site online →](03-vercel.md)**
