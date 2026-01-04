# Admin Guide

This guide is for **league administrators** who manage users, security, and system setup.

---

## Admin Responsibilities

As an admin you can:
- Create and manage user accounts
- Reset passwords
- Disable or reset MFA for users
- Import and correct rosters
- Prepare demo or production databases
- Deploy the application

---

## Admin Accounts

### Default admin
When you run:

```bash
npm run seed
```

An admin account is created if it does not already exist.

Defaults:
- Email: `admin@example.com`
- Password: `admin1234`

Override using environment variables **before seeding**:
```bash
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD="strongpassword"
```

---

## User Management

### Create a user (manual)
Currently, user creation is done directly in the database.

Example (Prisma Studio):
```bash
npx prisma studio
```

Create a `User` with:
- email
- passwordHash (bcrypt)
- mfaEnabled = false

> A UI for user management can be added later if needed.

---

## MFA Administration

### Reset MFA for a user
If a user loses their authenticator device:

1. Open Prisma Studio:
```bash
npx prisma studio
```

2. Locate the user
3. Set:
   - `mfaEnabled = false`
   - `mfaSecret = null`
   - `mfaTempSecret = null`

The user can then sign in without MFA and re-enroll.

---

## CSV Imports (Admin Tips)

- CSV imports are **safe to re-run**
- Matching is done by:
  - First name
  - Last name
  - Birthdate
  - Team
- Weight changes overwrite existing records

### Recommended workflow
1. Import initial roster
2. Re-import updated weigh-in CSVs
3. Verify counts on team roster pages

---

## Database Management

### SQLite (local)
Files:
- `prisma/dev.db`
- `prisma/e2e.db`

Reset:
```bash
npm run dev:sqlite:reset
```

---

### Postgres (Docker / Prod)

Start local Postgres:
```bash
npm run pg:up
```

Reset Postgres DB:
```bash
npm run dev:pg:reset
```

---

## Deployment (Vercel)

### Required environment variables
- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `ADMIN_EMAIL` (optional)
- `ADMIN_PASSWORD` (optional)

### Build process
Vercel runs:
```bash
npm run vercel-build
```

Which:
1. Switches Prisma to Postgres
2. Generates client
3. Applies migrations
4. Builds Next.js

---

## Backups

### Recommended
- Enable automated backups on Postgres provider
- Export CSV rosters before major edits
- Keep migrations under version control

---

## Security Best Practices

- Require MFA for all admins
- Rotate `NEXTAUTH_SECRET` periodically
- Do not reuse admin passwords
- Restrict DB access credentials

---

## Planned Admin Enhancements

Future improvements may include:
- Admin UI for users
- Role-based access control (RBAC)
- MFA recovery codes
- Audit logs


## Results entry

Coaches/Admins can enter results on the meet page. Results are stored on each bout.

If you want VIEWER accounts to enter results, change RBAC so the results endpoint requires VIEWER instead of COACH (not recommended).
