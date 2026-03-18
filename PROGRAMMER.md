# Programmer Documentation

Tech stack:
- Next.js 14
- TypeScript
- Prisma
- NextAuth
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

## Notifications

Meet notifications are routed through `src/lib/notifications.ts`.

- App email delivery is controlled from `Admin > Notifications` for all app emails, including meet notifications, welcome emails, and password reset emails.
- `Log` writes outbound email records to `NotificationLog` without calling SendGrid.
- `Whitelist` sends only to whitelisted addresses and skips the rest.
- `Everyone` sends to all recipients.
- `None` disables app email delivery.

Current event coverage:
- `meet_ready_for_attendance` fires when a meet is created in the `ATTENDANCE` phase.
- `meet_ready_for_checkin` can fire when a meet moves from `DRAFT` to `READY_FOR_CHECKIN` and the coordinator leaves the parent notification checkbox enabled.
- `meet_published` can fire when a meet moves from `READY_FOR_CHECKIN` to `PUBLISHED` and the coordinator leaves the parent notification checkbox enabled.

Testing:
- Unit tests: `npx vitest run src/lib/notifications.test.ts`
- Local manual test: set app email delivery to `Log` in `Admin > Notifications`, then create a meet and inspect the `NotificationLog` table.
