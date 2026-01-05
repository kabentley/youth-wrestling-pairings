# Programmer Documentation

Tech stack:
- Next.js 14
- TypeScript
- Prisma
- NextAuth + MFA
- SQLite / Postgres
- Vitest + Playwright
- ESLint (type-aware)

## Commands
```bash
npm run dev
npm run dev:pg
npm run lint
npm test
npm run test:e2e
```


## RBAC

Roles are stored on `User.role` (ADMIN/COACH/PARENT). Mutating API routes require at least COACH. Admin routes require ADMIN.


## Results

Bout results are stored on `Bout`:

- `resultWinnerId`
- `resultType` (DEC/MAJ/TF/FALL/etc.)
- `resultScore` (string)
- `resultPeriod` (int)
- `resultTime` (mm:ss)
- `resultNotes` (optional)
- `resultAt` timestamp

API:
- `PATCH /api/bouts/:boutId/result` (requires COACH+)
