# Start here

This guide takes you from nothing to a working shop website with a real
database. You do not need to know how to write code.

You will need about **an hour**, and you can stop at any point and come back —
nothing breaks if you walk away halfway through.

---

## What you are building

Picture three separate services that talk to each other:

```
  1. VERCEL          the website and the server behind it.
                     Someone types your address and sees your shop,
                     on any phone, anywhere.
                        │
                        ▼
  2. NEON            the database. Every shop, product, sale and
                     customer is stored here. It is a real database,
                     not a file, so two people using the shop at the
                     same time cannot overwrite each other.
                        │
  3. AN EMAIL         sends the six-digit sign-in code. The shop never
     PROVIDER        stores a password.
```

You will set up those three, in that order — backwards, actually: the database
first, because the website needs somewhere to put things.

**Cost:** zero, on the free plans of all three. Free plans have limits, and
[How much this costs](08-cost-and-limits.md) says exactly what they are, in
plain terms, so nothing surprises you in month two.

---

## The seven steps

Do them in this order. Each one ends with something you can *see working*
before you move on, which is what makes it safe to stop halfway.

| | Step | Time | What you will have at the end |
|---|---|---|---|
| 1 | [Create the database](01-neon.md) | 10 min | An empty but ready database at Neon |
| 2 | [Put the tables in it](02-database-setup.md) | 10 min | A database with tables, and a demo shop to look at |
| 3 | [Put the site online](03-vercel.md) | 20 min | Your shop website, live at an address you can send to someone |
| 4 | [Join the two together](03-vercel.md#step-4--add-the-settings-that-hold-secrets) | 5 min | A live site that can actually save a sale |
| 5 | [Turn on sign-in emails](04-email.md) | 15 min | A real sign-in code arriving in a real inbox |
| 6 | [Take M-Pesa](05-mpesa.md) | 20 min | Customers paying into your own till |
| 7 | [Make yourself the platform admin](06-admin.md) | 5 min | A console at `/admin/` showing every shop |

Steps 1–4 give you a working shop. **Steps 5–7 can wait** until you are ready
to take money — the site works without them, you just cannot sign in yet.

---

## Words you will meet

Every guide explains its own words, but these come up everywhere. Skim them
now; you will recognise them later.

| Word | What it actually means |
|---|---|
| **Database** | Where the data is kept. Think of it as a very strict set of spreadsheets that cannot be left half-saved. |
| **Neon** | A company that runs a database for you. You will not install anything. |
| **Vercel** | A company that puts a website on the internet and keeps it running. |
| **Deploy** | Publish. "Deploying" is copying your site to the internet so people can see it. |
| **Environment variable** | A setting, typed into a web page, that the server reads when it starts. Like a name and address card you fill in once. |
| **Repository** (or **repo**) | The folder holding all the site's files, stored on GitHub. |
| **GitHub** | Where the files live. It is a filing cabinet, not a website host — though it can also host simple sites. |
| **API** | The part that does the work: saving a sale, checking a sign-in code. Your website's buttons talk to it. |
| **Server** | A computer somewhere that is always on and answers requests. Vercel runs the server for you. |
| **Connection string** | One long line of text that is the address plus the password for a database, in one go. You copy and paste it; you never type it. |
| **Migration** | The list of instructions that builds the tables in a database. |
| **Seed** | Sample data, so the site is not empty while you look around. |

---

## Two ways to do every step

Every guide shows the same step twice:

- **Without a terminal.** Click, copy, paste. If you have never opened a
  terminal, use this. It does everything the other way does.
- **With a terminal.** One command instead of twenty clicks, for anyone who
  prefers it. This is the smaller box, usually at the end.

You only need one. The terminal version is never required.

---

## If something goes wrong

Every guide ends with **"If it does not work"** — the three or four things that
actually go wrong, each with what you will see and what to do.

Then there is [Troubleshooting](09-troubleshooting.md): a single page with the
message you are looking at on the left and the fix on the right.

One thing worth knowing before you start: **nothing in this system can lose a
sale.** If the internet drops mid-sale, the till keeps selling and catches up
when the connection returns. That is by design, and it is why the setup steps
look fussier than they need to.

---

## The other guides

These are for reference once you are running, not for setup:

- [Email and sign-in](04-email.md) — how the code reaches a person, and why
  there are no passwords
- [M-Pesa](05-mpesa.md) — each shop's own till, and why the money never
  touches the platform
- [The platform console](06-admin.md) — the different sign-in at `/admin/`
- [eTIMS and KRA](07-etims.md) — what is finished, and what is not yet
- [How much this costs](08-cost-and-limits.md) — free-plan limits, honestly
- [Troubleshooting](09-troubleshooting.md) — message → fix
- [The settings](03b-vercel-settings.md) — what each one does, and which you can
  ignore
- [Neon Auth](03c-neon-auth.md) — the Auth button next to your database: leave
  it alone, and here is why
- [For developers](10-for-developers.md) — the technical version, if you are
  handing this to someone who codes

Next: **[1 · Create the database →](01-neon.md)**
