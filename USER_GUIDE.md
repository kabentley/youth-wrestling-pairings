# User Guide

This app manages youth wrestling rosters, meets, parent attendance, and results.

## Sign In

Use your username and password on `/auth/signin`.

- If parent self-signup is enabled by an admin, the sign-in page shows **Create New Account**.
- If parent self-signup is disabled, parents must get an account from an admin or coach.
- If you forget your password, use the reset-code flow from the sign-in area.

## Home

After signing in, the home page can show:

- League news from the configured league website
- Team news from your team's website
- Navigation to Rosters, Meets, My Wrestlers, Team Settings, Account, and Admin based on your role

## Roles

- `PARENT` users use **My Wrestlers**, **Attendance**, and **Today**
- `COACH` users can manage meets, rosters, results, and team settings
- `TABLE_WORKER` users have limited meet access
- `ADMIN` users can manage league settings, users, and teams

## My Wrestlers

Parents use `/parent` to manage their linked wrestlers.

- View linked wrestlers with age, weight, and experience
- Open the wrestler picker to link or unlink active wrestlers from your team
- See attendance status and today's meet cards
- Review match history and recorded results for each linked wrestler

## Attendance

Parents use `/parent/attendance` to respond to upcoming meets.

- Mark each linked wrestler as coming or not coming
- See the attendance deadline when one is set
- Update responses until the meet deadline or workflow prevents changes

## Today

Parents use `/parent/today` to view published match information.

- See today's meet cards
- View mat assignments, bout order, opponents, and recorded results

## Rosters

Roster pages let users view team rosters. Coaches and admins can manage roster data through the roster and team-management screens.

## Meets

Coaches and admins use the Meets area to run events.

### Create a meet

- Use **Create New Meet**
- Select 2 to 5 teams
- Set meet options such as location, attendance deadline, mat count, and pairing rules
- New meets start in attendance so parents can respond before pairings are finalized

### Meet workflow

- `ATTENDANCE`: parents respond for their wrestlers
- `READY_FOR_CHECKIN`: meet is ready for event-day check-in
- `PUBLISHED`: parents can see published bouts and results

### Meet management

Depending on role and phase, coaches/admins can:

- Generate or adjust pairings
- Assign mats and bout order
- Track scratches and comments
- Record results for each bout
- Delete, restore, or purge meets

## Results

On a meet page, each bout has a **Result** section.

You can record:

- Winner
- Result type such as `DEC`, `MAJ`, `TF`, `FALL`, `DQ`, or `FOR`
- Score
- Period
- Time

Saved results appear in parent views and match history.

## Team Settings

Coaches use `/coach/my-team` to manage team-level data.

- Update team info, logo, website, and location
- Manage mat setup defaults
- Manage meet defaults
- Create and manage parents, coaches, and table workers
- Import parent accounts in bulk

## Account

Use `/account` to update your own profile details such as name, email, phone, team assignment, and password where permitted.
