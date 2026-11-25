# Start here — Shop Yangu Kenya, the short way

This folder is the new set of instructions. It is deliberately small: six
guides, read in order, nothing to cross-reference in your head.

The old `docs/` folder still exists and is still correct where it talks about
M-Pesa, ETIMS, the admin console and the database in depth. It grew to twenty
files because it answered every question anybody ever asked. **If you are
setting the shop up for the first time, you only need this folder.**

---

## What you are setting up

A shop app that runs in a browser — on a phone, a laptop, the counter tablet —
and keeps working when the internet at the shop drops.

- **Sell** things, take cash, M-Pesa or credit
- **Stock** that goes down by itself when you sell
- **Receipts** that print, and an ETIMS-ready invoice
- **Reports** for the day, the week, the month
- **One login per shop.** Email and password. No staff accounts to manage.

It is already written. You are not building it. You are putting it somewhere
the internet can reach, and connecting three services to it.

---

## The order to do things in

Do them in this order. Each one gives you something you can check before the
next one, so a mistake is found in one guide rather than at the end.

| # | Guide | What you end up with | How long |
|---|---|---|---|
| 1 | **[Get the code onto GitHub](01-github.md)** | Your own copy of the project | 15 min |
| 2 | **[Create the database](02-database.md)** | Two long text strings, kept safe | 20 min |
| 3 | **[Put it online](03-deploy.md)** | A real web address that opens the site | 15 min |
| 4 | **[Email and signing in](04-email-and-sign-in.md)** | A shop you can actually log into | 20 min |
| 5 | **[M-Pesa](05-mpesa.md)** | Payments from a phone | 45 min |
| 6 | **[When something is wrong](06-troubleshooting.md)** | A way out of every common trap | as needed |

Add the times up: **about two hours**, and you do not have to do it in one
sitting. Steps 1–4 give you a working shop that takes cash. M-Pesa is the
longest and can wait a day.

---

## What you need before you start

Six things. All free.

1. **An email address you can open on the same device you are working on.**
   Password resets and sign-in codes go there.
2. **A GitHub account** — github.com. Free.
3. **A Neon account** — neon.com. Free. This is the database.
4. **A Vercel account** — vercel.com. Free. This is where the site lives.
   Sign up with GitHub and the two connect themselves.
5. **The shop's real details**: name, phone number, and if you have it the KRA
   PIN. You can fill these in later on the Settings screen instead.
6. **For M-Pesa only**: the shop's Safaricom number, its M-Pesa short code, and
   the name on the M-Pesa account.

You do **not** need: a credit card, a domain name, a server, a terminal, or
anybody technical. Every step is done in a web page.

---

## Two words that come up constantly

- **Repository** (or "repo"). A folder of code, stored on GitHub. Yours is a
  copy of this one.
- **Deployment.** One published copy of the site at one web address. Vercel
  does one every time the code changes.

Everything else is explained where it first appears.

---

## If you get stuck

**[06-troubleshooting.md](06-troubleshooting.md)** is written as a list of
symptoms in plain words — "the page says the shop server is not answering",
"no email arrived", "M-Pesa says invalid credentials". Find your sentence, read
the fix. It also says how to tell which of the four services is at fault.

---

## The same thing written for a programmer

If somebody who codes is helping you, or is taking this over:
**[`docs/10-for-developers.md`](../docs/10-for-developers.md)**. It has the file
layout, the tests, and the traps. You do not need it to run a shop.

---

## Where the rest of the detail lives

The old folder is not dead, it is just reference material now.

- **`docs/05-mpesa.md`** — M-Pesa in full depth, including going live
- **`docs/06-admin.md`** and **`docs/06-super-admin.md`** — the platform
  console for whoever runs the platform
- **`docs/07-etims.md`** — the invoice side, for later
- **`docs/08-cost-and-limits.md`** — what any of this costs once it is real
- **`docs/10-for-developers.md`** — for a programmer changing the code

Start with this folder. Go there when you want the long version of one thing.
