# Wrestling Scheduler

A full-stack web application for scheduling **youth wrestling dual and quad meets**.

Supports:
- 2–4 teams per meet
- Fair matchup generation with age/weight/experience constraints
- Manual pairing overrides
- Mat assignment and drag‑and‑drop mat boards
- CSV roster import with safe upserts
- Authentication with **password + MFA (TOTP)**
- SQLite for local dev/tests, Postgres for production (Vercel)

## Quick start (local)

```bash
npm install
cp .env.example .env
npm run db:sqlite
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Login: `admin / admin1234`

## Docs
- Programmer: PROGRAMMER.md
- User: USER_GUIDE.md

- Admin guide: ADMIN_GUIDE.md

## Prod DB backup and dev restore

Use this when you need prod-like data locally for debugging.

Prereqs:
- PostgreSQL client tools installed (`pg_dump`, `pg_restore`) and on PATH
- `PROD_DATABASE_URL` set to production Postgres connection string
- `DEV_DATABASE_URL` set to your local/dev Postgres database

Commands:

```bash
# 1) Create a backup file in /backups
npm run db:backup:prod

# 2) Restore a specific backup file to dev Postgres
npm run db:restore:dev:from-backup -- --in backups/prod-YYYYMMDDTHHMMSSZ.dump

# Or do both steps in one command (temp file; add -- --keep to keep dump)
npm run db:refresh:dev:from-prod
```

After restore, run the app against Postgres:

```bash
npm run dev:pg
```

If you do not want to run local Postgres, refresh your local SQLite DB directly from prod:

```bash
# Uses PROD_DATABASE_URL as source and DATABASE_URL/SQLITE_DATABASE_URL as SQLite target.
# By default it also creates a backup copy of your current SQLite file under /backups.
npm run db:refresh:sqlite:from-prod
```

## Admin
Admins can manage users at `/admin/users`.
