# Step 2 — Create the database

*20 minutes. Free. You need the GitHub account from Step 1.*

At the end of this page you will have somewhere for the shop's data to live, and
**two long text strings** saved somewhere safe. Those two strings are the most
valuable thing you will handle today. Do not close anything until they are
written down.

---

## Why a database, and not just the browser

The shop's data — products, sales, customers, stock — has to be reachable by
every phone in the shop at the same time.

If it lived in the browser on one phone, a second till would not see the first
till's sales, the stock counts would drift apart, and closing the browser would
throw the day's trading away.

So the data lives in one place that everybody reads and writes: a **database**,
run by Neon, over the internet. The free plan is enough for a real shop.

> **Word to know — database.** A very strict set of tables that can never be
> left half-saved. If the power dies mid-sale, that sale is either completely
> recorded or not recorded at all. Never half.

---

## Step 1 — Make a Neon account

1. Go to **<https://neon.tech>**
2. Press **Sign Up**, top right.
3. Sign up with GitHub if you can — one fewer password. Google or an email
   address works just as well.

You land on a page asking you to create your first project.

---

## Step 2 — Create the project

A **project** in Neon is one database. You need one.

1. **Project name:** `shop-yangu`. Any name works; this one is easy to spot.
2. **Postgres version:** leave whatever is already selected.
3. **Region:** pick the one nearest Kenya. In order of preference:
   **AWS · Europe (Frankfurt)**, then **AWS · Europe (Ireland)**, then
   **AWS · South Africa (Cape Town)** if it is offered. Nearer means a sale
   saves faster. Frankfurt is the safe choice if you are unsure.
4. Press **Create project**.

A page headed **Connection Details** appears. Keep it open — you need it in the
next step.

> **Ignore the "Auth" button for now.** It is a sign-in service Neon offers
> beside your database. This shop has its own sign-in, but Step 4 shows how
> Neon's can send the very first code that opens your shop, which saves setting
> up an email provider on day one. Nothing is switched on until you do that.

---

## Step 3 — Copy the two strings

This is the step people get wrong, so read it twice.

There are **two** connection strings, and they look almost identical:

| Label in the guide | How to recognise it | What it is for |
|---|---|---|
| **`DATABASE_URL`** (pooled) | the host contains `-pooler` | the shop talking to the database all day |
| **`DATABASE_URL_UNPOOLED`** (direct) | the host has **no** `-pooler` | building the tables, once |

On the Neon Connection Details panel:

1. You will see a dropdown that says **Connection string** and another that
   says **Pooled connection** (or a toggle marked **Pooled**).
2. With **Pooled** switched **on**, copy the string. It starts
   `postgresql://neondb_owner:...@ep-...-pooler....neon.tech/neondb?sslmode=require`.
   That is `DATABASE_URL`. Save it.
3. Switch **Pooled** **off**. Copy again — the only difference is the missing
   `-pooler`. That is `DATABASE_URL_UNPOOLED`. Save it too.

> **The password is inside the string.** It looks like `npg_AbCdEf123456`. If
> you ever need to see it again, the Connection Details panel always has it.
> Never paste either string into a chat, an email, or a screenshot.

Write both somewhere you will still have them tomorrow. A password manager is
ideal. Notes on a computer is fine. WhatsApp to yourself is better than nothing.

---

## Step 4 — Put the tables in

An empty database is a blank notebook. This step writes the headings in it.

The instructions are all in one file in your repository: **`db/apply-all.sql`**.

1. Open your fork on GitHub: `github.com/YOUR-NAME/Shop-Yangu-Kenya`
2. Click the **`db`** folder, then click **`apply-all.sql`**.
3. Press the **copy** icon at the top right of the file — the two overlapping
   squares.

   > Do not drag the mouse to select. It is about 1,700 lines and it is very
   > easy to miss the top or the bottom. Use the copy button.

4. Go back to Neon and click **SQL Editor** in the left sidebar.
5. Click into the big empty box, paste, and press **Run**.

Wait a moment. Then you will see one of these:

| What you see | What it means |
|---|---|
| **Success**, or **APPLIED** | Done. |
| `Already applied — nothing to do` | You ran it before. Nothing is broken. |
| Anything containing **error** | Stop. Read the message against the list below. |

Running it twice can never break anything: the file checks whether it has
already run, and stops if it has.

---

## Step 5 — Optional: a demo shop to look at

Skip this if you are setting up a real shop. Most people run it, because an
empty dashboard tells you nothing about whether things work.

1. In the same folder, open **`db/apply-demo.sql`**, copy it the same way.
2. Paste into a **new** SQL Editor tab and press **Run**.
3. You now have a shop called *Demo Shop* with products, a few sales and
   customers, so every screen has something on it.

To remove it later, there is a comment at the top of that same file with the
one line that deletes it. `docs2/06-troubleshooting.md` also mentions it.

---

## Check it worked

In the Neon sidebar click **Tables**. You should see about fifteen tables, with
names like `shops`, `products`, `sales`, `logins`, `sessions`.

If you ran the demo file, click **SQL Editor** and run:

```sql
select name from shops;
```

You should see `Demo Shop` (or your own shop name, if you made one).

---

## If it does not work

**"prepared statement" or "transaction" in the error.**
You pasted the pooled string into the wrong place, or you are running the SQL
through a pooled connection. Neon's SQL Editor always uses the direct one, so
this almost always means an instruction further on told you to use the wrong
string. For building tables, always the one **without** `-pooler`.

**"permission denied for schema public".**
Rare on a fresh Neon project. Go to **Settings → Roles** and check you are
signed in as the owner. If it persists, delete the project and start again —
it takes two minutes and is faster than debugging.

**"syntax error at or near …" pointing at a line in the middle.**
The paste was truncated. Copy again with the copy button, not by selecting.

**"relation already exists".**
Harmless, and it means the file has partly run before. Run it once more; it
will finish and then say *already applied*.

---

## On the free plan, one thing to know

Neon free projects **sleep** after about five minutes with no traffic. The
first visitor after a nap waits a few seconds while it wakes. That is normal,
and it only happens on the free plan.

Everything in this shop is written to cope with it — a request that arrives
during the nap is retried rather than failing.

---

Next: **[Step 3 — Put it online](03-deploy.md)**
