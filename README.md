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


## Admin
Admins can manage users at `/admin/users`.
