# 8 · How much this costs, and where it stops being free

Written honestly, including the one thing that most guides leave out: **Vercel's
free plan is for non-commercial use.** If this is a real shop taking real money,
read the first section before you go live.

---

## The one thing you must know

**Vercel's free "Hobby" plan is licensed for personal, non-commercial projects
only.** That is in their terms, not a rumour. A site that sells goods or
services is commercial use.

What that means in practice:

| You are doing this to… | Plan you should be on | Cost |
|---|---|---|
| Learn, demo, show a client, build a prototype | Hobby (free) | **KES 0** |
| Run a real shop that takes money | Pro | **$20/month** (about KES 2,600) |
| Run this for several shops, as a platform | Pro | $20/month, one seat, covers all projects |

Nothing enforces this overnight — your site will not break. But it is their
rule, and a shop that quietly outgrows it can be asked to move. Being on the
right plan is also what gets you the bigger limits below.

> **If $20/month is too much for one duka**, the honest alternatives are
> in [below](#if-20month-is-too-much). The site itself is plain files; it can run
> almost anywhere.

---

## The three services, itemised

### Neon — the database

| | Free | What it means for a shop |
|---|---|---|
| Storage | **0.5 GB per project** | About 300,000–500,000 sales. Years for one duka. |
| Compute | **100 hours per month** | The database sleeps after 5 minutes idle, so a shop open 12 hours a day uses far less than this. |
| Traffic | 5 GB per month | The text of sales and products. Not a concern. |
| Card required | **No** | Free is permanent, not a trial. |

**What happens when it sleeps:** the first request after 5 idle minutes takes
about a second longer. For a shop that means the first sale of the morning is
slightly slow and everything after is normal. Nobody sees an error.

**When you would outgrow it:** a shop doing 500 sales a day for two years, or a
platform with dozens of shops. Then Neon's paid plan is usage-based, starting
around **$15/month** at typical small-shop volumes.

### Vercel — the website and the server

**Hobby (free):**

| | Limit | What it means |
|---|---|---|
| Bandwidth | 100 GB/month | Tens of thousands of page views. |
| Function calls | 1,000,000/month | Every sale, sign-in and screen refresh is one. A busy shop uses a few thousand a day. |
| Build minutes | 6,000/month | Each deploy takes ~2 minutes. You will not come close. |
| Deployments | 100/day | Not a concern. |
| Rule | **Non-commercial only** | See above. |

**Pro ($20/month):** 1 TB bandwidth, 1M function calls included, commercial use
allowed, longer function timeouts, and email support.

**What happens at the limit:** on Hobby, nothing is billed — the feature pauses
until the month rolls over. That is a hard stop, not a surprise invoice. On Pro,
overage is billed.

### Email — the sign-in codes

| Provider | Free allowance | Enough for |
|---|---|---|
| **Resend** | 3,000/month, 100/day | A shop with 100 sign-ins a day. Plenty. |
| **Brevo** | 300/day | Also plenty. |
| Your own domain's email | Varies by host | If you already pay for hosting. |

Sign-in codes are the only email the system sends. A shop with five staff
signing in twice a day sends ten emails a day. **Email will not be your limit.**

### Domain name (optional)

KES 1,000–1,500 per year from Truehost, HostPinnacle, Namecheap or Cloudflare.
Not required — the free `.vercel.app` address works and is safe to share.

### M-Pesa

Nothing to this software. Safaricom charges their normal transaction tariff,
exactly as they do at the counter. Daraja registration is free.

---

## The total

| Setup | Monthly |
|---|---|
| Learning, demoing, prototyping | **KES 0** |
| A real shop taking money, free domain | **~$20 (KES 2,600)** |
| A real shop, own domain | **~$20 + ~KES 110/month** for the domain |

That is the whole bill. There are no other services, no hidden meters, nothing
that starts charging when you look away.

---

## If $20/month is too much

Two options that keep this software and change the host.

**1. Ask Vercel directly.** Their support will tell you where the line is; a
one-person shop that is not really "a business" may be fine on Hobby. Do not
guess — the terms are theirs.

**2. Host the pages somewhere free-for-commercial and the server separately.**
GitHub Pages, Cloudflare Pages and Netlify all allow commercial use on their free
tiers. But then the pages and the server are on two different addresses, which
means the extra setup in [For developers](10-for-developers.md#splitting-the-site-from-the-api)
— more work, more to go wrong, and it is precisely the setup this guide moved
away from.

Our recommendation: **start on Hobby while you build and test, and move to Pro
on the day the first real customer pays.** $20/month against a shop's takings is
small, and it is the difference between a setup that is inside the rules and one
that is not.

---

## Two limits that are not about money

**Neon sleeps.** First request after five idle minutes takes about a second
longer. Expected, not a fault.

**A Vercel function must finish in under 60 seconds** on Hobby. Every route here
finishes in milliseconds. Nothing is at risk.

---

Next: **[9 · Troubleshooting →](09-troubleshooting.md)**
