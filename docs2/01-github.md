# Step 1 — Get the code onto your own GitHub

*15 minutes. No terminal. Everything happens on github.com.*

You need your own copy of the project, because Vercel will deploy **your**
copy, not somebody else's. That copy is called a **fork**.

---

## What a fork is, and why you want one

A **repository** is a folder of files that lives on GitHub. This project is one
repository. A **fork** is your own copy of it, in your own GitHub account, that
you can change without touching the original.

You want a fork because:

- Vercel can only deploy what you own.
- If the original changes tomorrow, your shop does not break overnight.
- Your shop's settings stay yours.

If you already have this code in your GitHub account, skip to
[Step 2 — Create the database](02-database.md).

---

## Do it

### 1. Make a GitHub account, if you do not have one

Go to **github.com**, press **Sign up**, and follow it through. It asks for an
email address, a password and a username.

> **Write the GitHub password down somewhere real.** Not in the shop's phone
> notes — on paper, or in a password manager. Losing it is recoverable but
> slow, and it is the one account everything else hangs from.

### 2. Open the project

Go to **github.com/SaintM254/Shop-Yangu-Kenya**.

You will see a list of folders and a big **README**. Look for the button in the
top right marked **Fork**, next to **Star**.

### 3. Fork it

Press **Fork**. On the page that opens:

- **Owner** should be your own username.
- **Repository name** — leave it as `Shop-Yangu-Kenya`.
- Leave **Copy the `main` branch only** ticked.

Press **Create fork**. Wait about ten seconds. You now have
`github.com/YOUR-NAME/Shop-Yangu-Kenya`, and the page says "forked from
SaintM254/Shop-Yangu-Kenya" under the title.

> **That address is yours. Write it down.** It is what you will point Vercel
> at in Step 3, and it is the only place your shop's code lives.

---

## Check it worked

You are done with this step when all four of these are true:

1. The page says your username at the top right, not somebody else's.
2. The heading says **YOUR-NAME/Shop-Yangu-Kenya**.
3. Under the heading it says "forked from SaintM254/Shop-Yangu-Kenya".
4. You can see folders named `api`, `db`, `docs`, `src`.

If any of those are wrong, you are still looking at the original project. Press
**Fork** again from the page you are on.

---

## Things people ask here

**Do I need to install anything?**
No. Not Git, not Node, not a code editor. Later steps happen in web pages too.

**Can I make it private?**
Yes, but do it after Step 3. Vercel's free plan connects to public repositories
most easily; a private one works too and just asks you to approve access. If
you make it private later, Vercel keeps deploying.

**Somebody said I should "clone" it. Do I need to?**
No. Cloning is what a programmer does on their own computer to change code. You
are deploying a shop, not editing it.

**Will I get the project owner's updates automatically?**
No, and that is on purpose. If you ever do want them, GitHub has a **Sync
fork** button on your fork's page. It is safe to ignore.

---

Next: **[Step 2 — Create the database](02-database.md)**
