# 6 · The platform console

**Time:** 5 minutes · **Cost:** free · **You need:** steps 1–4 done, and a way
to run one line of SQL

There are two completely different kinds of sign-in in this system, and it is
worth being clear about which is which before you make yourself an admin.

| | A **shop owner** | A **platform admin** |
|---|---|---|
| Signs in at | `/login/` | `/admin/` |
| Sees | One shop: its products, sales, customers, money | Every shop's *name and status* — and nothing inside them |
| Can | Run the shop | Pause a shop, see who is signed in |
| Cannot | See any other shop | Read any shop's sales, products or customers |

That last row is enforced in the database itself, not just hidden in a page. A
platform admin who tried to pull a shop's takings would be refused by the
database, not by a button.

---

## Step 1 · Choose the admin address

Pick the email address that will run the platform. Use a real one you control —
ideally **not** the address of any shop owner, so the two roles stay separate.

---

## Step 2 · Run one line of SQL

You will use the same Neon SQL Editor as in [step 2](02-database-setup.md).

### The easy way

1. Open the repository's `db` folder and click **`apply-super-admin.sql`**.
2. Check the email address inside it. The default is
   `admin@shopyangu.co.ke`. To use your own, change the one line that reads:

   ```sql
   perform create_super_admin('admin@shopyangu.co.ke', 'Platform admin');
   ```

   Change the email, and optionally the name. Keep the quotes.

   *(If you would rather generate the file with your address already in it, see
   the terminal version below.)*

3. Copy the whole file, paste into Neon's **SQL Editor**, and click **Run**.
4. You should see **Success** or **APPLIED**.

> **If it says "Already applied", and you changed the email:** it will not have
> taken your change. Run just this one line in the SQL Editor instead:
> ```sql
> select create_super_admin('you@example.com', 'Your Name');
> ```

### The terminal version

```bash
node scripts/build-sql.js --email you@example.com --name "Your Name"
# then open db/apply-super-admin.sql and paste it into Neon
```

---

## Step 3 · Sign in as the admin

1. Go to `https://your-address/admin/`.
2. Type the admin email address and ask for a code.
3. The code arrives the same way a shop owner's does — so
   [step 4](04-email.md) must be done, or nothing will arrive.
4. Enter it. You are in the console.

---

## Step 4 · Check what you can and cannot see

Worth doing once, so you know the boundary is real.

- You should see a list of shops, with their names and whether they are active.
- You should see how many people are signed in, and how many shops exist.
- You should **not** find any screen showing one shop's individual sales,
  customers or products. There is not one to find.

---

## ✅ Success looks like this

- [ ] `apply-super-admin.sql` reported **Success** or **APPLIED**.
- [ ] `/admin/` accepts your admin email and sends a code.
- [ ] After signing in, you see a list of shops.
- [ ] You cannot reach any shop's takings from the console.

---

## If it does not work

**`create_super_admin` does not exist.** You have not run
[`apply-all.sql`](02-database-setup.md) yet, or it failed. Do that first.

**The code never arrives at `/admin/`.** Email is not set up — that is
[step 4](04-email.md). The admin sign-in uses the same email system.

**"That address is not a platform admin."** The email in the SQL does not match
what you typed, character for character. Run the one-line `select
create_super_admin(...)` again with the exact address.

**I made a typo in the email address.** Run:
```sql
delete from logins where email = 'wrong@example.com' and role = 'super_admin';
```
then add the right one.

**I want a second admin.** Run the same line again with a different address.
There is no limit.

**Can I make myself a shop owner too?** Yes, but sign in at the right door:
owners use `/login/`, admins use `/admin/`. The same email can be both, with
two separate sign-ins.

---

Next: **[7 · eTIMS and KRA →](07-etims.md)**
