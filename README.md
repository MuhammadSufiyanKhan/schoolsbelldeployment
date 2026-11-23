# Schoolwell

School management for **web, mobile and desktop**, all on one Supabase (Postgres) database.

| Part | Folder | What it is |
|---|---|---|
| Web + mobile app | `web/` | Next.js 16 app. On phones it installs from the browser like an app (PWA) and keeps marking attendance offline. |
| Desktop app | `desktop/` | Electron wrapper (Windows / macOS / Linux) around the same web app. |
| Database | `supabase/` | SQL migrations: multi-campus schema, roles and permissions, row level security, audit log. |
| Tests | `scripts/` | 29 checks of the row level security rules on a real Postgres engine (`npm run test:rls`). |

## What works today
Login (Supabase Auth) · one school with many campuses (head office sees all, campus staff only their own) · roles and per-module
permissions (view / add / edit / approve / download, editable per school) · students and parent links · attendance with a 75% warning,
**offline-capable** · classes and subjects · fee challans, payments, receipts, voiding with a reason · notices · **parent app**
(sign up with the child's roll number and date of birth; sees only their own children's attendance, published results and fees) ·
append-only audit log.

**Not built yet:** exams and report cards, staff / HR / leave / payroll, admissions, timetables, accounts, the AI features
(face attendance, marking from photos, Urdu remarks and voice, the spoken diary, the Ilmi assistant). The earlier SQLite versions of
some of these screens are kept in `web/legacy/` for porting. They are not part of the build.

## Run it locally
```bash
# 1. Database: create a Supabase project, then run supabase/migrations/*.sql in order (SQL editor or CLI).
#    Create the first school and admin with supabase/bootstrap.example.sql (edit the CHANGE_ME values first).
# 2. Web app
cd web
cp .env.example .env.local        # fill in the three Supabase values
npm install
npm run dev                       # http://localhost:3000
```
`SUPABASE_SERVICE_ROLE_KEY` is a **secret**: it bypasses row level security and must only ever live in server-side environment variables.

## Deploy the web app (Vercel)
Import the repository, set **Root Directory** to `web`, and add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` (mark the last one *Sensitive*) for Production and Preview.

## Mobile
Open the deployed site in Chrome (Android) or Safari (iPhone) and choose *Install app* / *Add to Home Screen*.
Attendance marked without internet is stored on the device and sent automatically when the connection returns.
Native store apps are not part of this repository.

## Desktop
See [`desktop/README.md`](desktop/README.md). In short: `cd desktop && npm install && npm start`, and `npm run dist` builds an installer for the current OS.

## Security model
Access is enforced **in the database** (row level security on every table), not only hidden in the screens:
schools are kept apart, campus staff see their campus, teachers only the classes they teach, accountants only fees, and parents only the
children the school has confirmed (and only published results). Hard deletes are limited to the super admin; payments are voided with a reason;
the audit log cannot be edited or deleted. Passwords need 8+ characters with letters and numbers.
Known gaps before a real school goes live: no rate limiting on login or parent sign-up, no password-reset email flow, no daily-backup setup
(enable it in Supabase), and parent sign-up should be reviewed for abuse.

## Tests
```bash
npm install
npm run test:rls       # row level security rules, 29 checks
```
