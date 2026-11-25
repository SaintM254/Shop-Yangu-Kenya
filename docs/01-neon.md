# 1 · Create the database

**Time:** 10 minutes · **Cost:** free · **You need:** an email address

At the end of this page you will have an empty database that is ready for the
next step, and two long lines of text saved somewhere safe. Those two lines are
the only thing standing between you and a working shop, so do not close the tab
until you have them.

---

## What Neon is, and why not just keep it in a file

The shop's data — products, sales, customers, stock — has to live somewhere
that all the phones in the shop can reach at the same time.

You *could* keep it in the browser, on one phone. Then a second till would not
see the first till's sales, stock counts would drift apart, and closing the
browser would throw the day's trading away.

So the data lives in a **database**: one copy, in one place, that every phone
reads and writes. Neon runs that database for you, over the internet, and the
free plan is enough for a real shop.

> **Word to know — database:** a very strict set of spreadsheets that cannot be
> left half-saved. If the power dies mid-sale, the sale is either completely
> there or not there at all — never half there.

---

## Step 1 · Make an account

1. Go to **<https://neon.tech>**.
2. Click **Sign Up** (top right).
3. Sign up with Google, GitHub, or an email address and password. Any is fine.
   This is a separate account from everything else in this guide.

You land on a page asking you to create your first project. That is the next
step.

---

## Step 2 · Create the project

A **project** in Neon is one database. You need one.

1. **Project name:** type `shop-yangu`. Any name works; this one is easy to spot.
2. **Postgres version:** leave whatever is already selected.
3. **Cloud provider and region:** choose the region closest to Kenya. In order
   of preference: **AWS · Europe (Frankfurt)** (`eu-central-1`), then
   **AWS · Europe (Ireland)**, then **AWS · South Africa (Cape Town)** if it is
   offered. Closer means a sale saves faster. If you are not sure, Frankfurt is
   the safe choice — a lot of Kenyan traffic routes through Europe.
4. Click **Create project**.

You will see a page headed **Connection Details**. Keep it open.

> **Ignore the "Auth" button.** Neon offers a sign-in service next to your
> database. This shop has its own, and turning Neon's on does nothing useful
> here. [3c · Should I turn on Neon Auth?](03c-neon-auth.md) explains, so you do
> not have to take that on trust.

> **Which plan?** The **Free** plan. It is not a trial and it does not ask for
> a card. [How much this costs](08-cost-and-limits.md) explains its limits.

---

## Step 3 · Copy the two strings

This is the step people get wrong, so read it twice. There are **two** strings
and they are **not the same**. Neon has a switch for this on the Connection
Details page.

The switch is a small dropdown or toggle labelled **Connection pooling**, or a
choice between two strings that look almost identical. One has the word
`-pooler` in the middle of its address; the other does not.

### String A — the one with `-pooler` in it

This is the one **the website uses**. It is built to have many short
conversations at once, which is exactly what a website does.

1. On the Connection Details page, make sure **Connection pooling** is **on**,
   or choose the string that contains the word **pooler**.
2. Make sure the format dropdown says **PostgreSQL** (not "psql" or "Node.js").
3. Click the **copy** icon.
4. Paste it somewhere you will keep it — a note, a password manager, anywhere.
   Label it **`DATABASE_URL`**.

It looks like this. The `...` is a long random password, and the address has
`-pooler` in it:

```
postgresql://neondb_owner:npg_XXXXXXXXXXXX@ep-cool-name-123456-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

> **Careful:** if what you copied has no `-pooler` in the address, it is the
> wrong one. Switch pooling on and copy again.

### String B — the one *without* `-pooler`

This one is used **once**, in the next step, to build the tables. It is the
more careful of the two, and it is the only one that can make structural
changes.

1. Turn **Connection pooling** **off**, or choose the string with no `pooler`
   in the address.
2. Copy it.
3. Paste it somewhere safe and label it **`DATABASE_DIRECT`**.

Both strings contain the same password and end with `?sslmode=require`. Keep
both. You will not need to look at either again after step 3.

> **If you lose them:** go back to <https://console.neon.tech>, click your
> project, then **Connection Details**, and copy again. It is not a problem.
> If you have already put one into Vercel, replacing it there is one click.

---

## Step 4 · Check you can get back in

Close the Neon tab. Open <https://console.neon.tech> and sign in again. Your
project `shop-yangu` should be there, with **Connection Details** reachable from
the dashboard.

If yes, this step is done.

---

## ✅ Success looks like this

- [ ] You have an account at neon.tech.
- [ ] There is one project called `shop-yangu`.
- [ ] You have saved **two** strings: one with `-pooler` in it, one without.
- [ ] Both start with `postgresql://` and end with `?sslmode=require`.
- [ ] You can sign back in to the Neon console.

The database is **empty** at this point. That is correct — the tables get built
in the next step.

---

## If it does not work

**"I don't see Connection pooling anywhere."**
It is not on the dashboard — it is inside **Connection Details**. Click your
project first, then look for the Connection Details panel on the right.

**"Both my strings look identical."**
Compare the address in the middle, the part starting `ep-`. One will contain
`-pooler` and the other will not. If neither does, pooling is off; turn it on
and copy again.

**"It asks for a credit card."**
You are on the wrong plan. Go back and choose **Free**. If a card prompt is
unavoidable on a page you reached, you are on a signup flow for a paid plan —
start again at <https://neon.tech> and pick Free.

**"The project creation spun forever."**
Refresh. Neon sometimes takes thirty seconds and refreshes badly. The project
is usually created; check the dashboard before trying again.

**"I picked the wrong region."**
It does not matter much — you can carry on. Changing it later means making a
new project and redoing [step 2](02-database-setup.md), which takes ten
minutes.

---

Next: **[2 · Put the tables in →](02-database-setup.md)**
