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

## Notifications

Meet notifications are routed through `src/lib/notifications.ts`.

- `NOTIFICATIONS_TRANSPORT=log` writes outbound notifications to `NotificationLog` without calling SendGrid or Twilio. Use this for local development.
- `NOTIFICATIONS_TRANSPORT=live` sends through SendGrid for email and Twilio for SMS, then records the provider result in `NotificationLog`.
- `NOTIFICATIONS_TRANSPORT=off` disables meet notifications.

Current event coverage:
- `meet_ready_for_attendance` fires when a meet is created in the `ATTENDANCE` phase.
- `meet_ready_for_checkin` can fire when a meet moves from `DRAFT` to `READY_FOR_CHECKIN` and the coordinator leaves the parent notification checkbox enabled.
- `meet_published` can fire when a meet moves from `READY_FOR_CHECKIN` to `PUBLISHED` and the coordinator leaves the parent notification checkbox enabled.

Testing:
- Unit tests: `npx vitest run src/lib/notifications.test.ts`
- Local manual test: create a meet with `NOTIFICATIONS_TRANSPORT=log`, then inspect the `NotificationLog` table.
