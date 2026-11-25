# Shop Yangu Kenya — the guides

Written for someone who has never deployed anything. No jargon without a
translation, no step that needs you to read code.

**Start at [00-start-here.md](00-start-here.md).** It is a one-page map of the
whole setup, and it tells you which guide to open next.

---

## The guides

Setup, in the order you do them:

| | Guide | Time | Ends with |
|---|---|---|---|
| — | [Start here](00-start-here.md) | 5 min | Knowing what you are building and what it costs |
| 1 | [Create the database](01-neon.md) | 10 min | An empty database at Neon, and two saved strings |
| 2 | [Put the tables in](02-database-setup.md) | 10 min | Tables, and a demo shop to look at |
| 3 | [Put the site online](03-vercel.md) | 20 min | Your shop, live at an address you can share |
| 4 | [Turn on sign-in emails](04-email.md) | 15 min | A real code arriving in a real inbox |
| 5 | [Take M-Pesa](05-mpesa.md) | 20 min | Customers paying into your own till |
| 6 | [The platform console](06-admin.md) | 5 min | A console at `/admin/` |

Steps 1–3 give you a working site. 4–6 make it usable by real people.

Reference, once you are running:

| | Guide | For |
|---|---|---|
| 7 | [eTIMS and KRA](07-etims.md) | What is finished and what is not, before you promise anyone tax compliance |
| 8 | [How much this costs](08-cost-and-limits.md) | Free-plan limits, honestly — including where free stops being allowed |
| 9 | [Troubleshooting](09-troubleshooting.md) | Message → fix |
| 10 | [For developers](10-for-developers.md) | The technical version, for whoever maintains the code |

Two pages that answer questions the setup raises:

| | Guide | For |
|---|---|---|
| 3b | [The settings, and what each one is for](03b-vercel-settings.md) | Which setting is to blame, and which ones you can ignore |
| 3c | [Should I turn on Neon Auth?](03c-neon-auth.md) | No — and why, before you click the button next to your database |

---

## If you only read one page

[Start here](00-start-here.md). It has the map, the words you will meet, and
the order.

## If something is broken

[9 · Troubleshooting](09-troubleshooting.md), or open
`https://your-address.vercel.app/api/health` — that page is the system telling
you what it can and cannot reach.

---

<details>
<summary>Where the older, more technical docs went</summary>

These guides replaced a set written for developers. Each old file still exists
at its old address so nothing breaks, and each one now points here:

| Old file | Now |
|---|---|
| `01-neon-setup.md` | [01-neon.md](01-neon.md) |
| `02-run-order.md` | [02-database-setup.md](02-database-setup.md) and [10-for-developers.md](10-for-developers.md) |
| `03-link-the-page.md` | [03-vercel.md](03-vercel.md) — the two hosts are now one |
| `04-email-sign-in.md` | [04-email.md](04-email.md) |
| `05-mpesa-tills.md` | [05-mpesa.md](05-mpesa.md) |
| `06-super-admin.md` | [06-admin.md](06-admin.md) |
| `07-etims-later.md` | [07-etims.md](07-etims.md) |

</details>
