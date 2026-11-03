# Contributing to mask0

## Prerequisites

- Node.js 22 and pnpm 11 (`corepack enable`; the version is pinned in `package.json`)
- Supabase CLI (`supabase --version`), for applying migrations
- A Supabase account
- Optional: Docker Desktop, to run the database tests locally

## First run (hosted Supabase)

1. **Create a project** at supabase.com in the **Tokyo region** (Northeast Asia, `ap-northeast-1`).
   Save the database password.
2. **Fill in `.env`** (copy `.env.example` if it doesn't exist). The comments in it say where each
   value is in the dashboard: project URL, publishable key, the Transaction pooler connection string
   (`DATABASE_URL`), the project ref and the database password. Intake and screening also need
   `SUPABASE_SECRET_KEY` (server-only storage access), `PII_ENCRYPTION_KEY` (generate it once with
   the command in the file and back it up: without it, stored emails and phone numbers can't be
   read) and either `ANTHROPIC_API_KEY` or `AI_FAKE=1`.
3. **Apply the migrations:**
   ```bash
   supabase login     # once per machine
   pnpm db:link       # links this folder to SUPABASE_PROJECT_REF
   pnpm db:push       # applies supabase/migrations (asks before applying)
   ```
4. **Auth settings in the dashboard** (Authentication section):
   - URL configuration: Site URL `http://localhost:3000`; add `http://localhost:3000/auth/callback` to
     the redirect URLs (later also your Vercel preview pattern and production domain).
   - Email provider: keep "Confirm email" on; set the minimum password length to 8.
   - Emails (SMTP): the built-in sender is for testing only. It has a low hourly limit and may only
     deliver to your Supabase team's own addresses. Set up custom SMTP (for example Resend) before
     anyone else signs up.
5. **Run the app:**
   ```bash
   pnpm install
   pnpm dev           # http://localhost:3000, then sign up with your own email
   ```

Run `pnpm inngest:dev` in a second terminal to execute background jobs locally.

## Local Supabase (optional)

`pnpm db:start` runs Supabase in Docker with the migrations and `supabase/seed.sql` (a demo
company and a demo login, listed at the top of that file; local only, never pushed). `pnpm env:local`
then writes `.env.local`, which overrides `.env`; delete it to use the hosted project again. Auth
emails from the local stack land in Mailpit at http://127.0.0.1:54324.

To try the whole intake flow locally:

```bash
pnpm db:start
pnpm env:local --force   # local keys, a fresh PII key and AI_FAKE=1
pnpm dev
pnpm inngest:dev         # second terminal: runs reading and screening
```

Sign in with the demo login, publish a job, issue an entry URL and open it on a phone-sized window.
With `AI_FAKE=1`, PDFs with a text layer are read as text, photos come back unreadable (so they land
in "needs review"), and specialist conditions match by keyword. Nothing is sent to Anthropic.

To try booking, pass an applicant in 書類選考, then copy their booking link from 面接予定者 (the
row's menu). Invitations, follow-ups, confirmations and reminders are Inngest functions, so keep
`pnpm inngest:dev` running; automatic emails wait out quiet hours (21:00–08:00 Japan time), and
the Inngest dev UI at http://localhost:8288 shows each run's sleeps. Without `RESEND_API_KEY`,
emails are only recorded in 設定 → 送信履歴 as 記録のみ.

The demo login is an owner, so the first sign-in asks for two-factor authentication: scan the QR
code with an authenticator app (or type the key shown under it). `pnpm db:reset` removes the
factor again.

Interviews open from 面接 (the day list) or from a booked row in 面接予定者. In the workspace, paste
a WebVTT/SRT export (or `名前: 発言` lines) under 記録とレポート to try the AI report; with
`AI_FAKE=1` the questions and the report are placeholders. A decision's emails go out 10 minutes
after it, so keep `pnpm inngest:dev` running to see them.

The AI interviewer (Phase 5) is behind a feature flag that only mask0 staff set. To try it
locally, switch it on for the demo company:

```bash
docker exec supabase_db_maskzero psql -U postgres -c "update organizations set feature_flags = '{ai_interviewer}' where slug = 'demo'"
```

Then open a job and choose AI面接 to add questions and switch it on. Passing an applicant for that
job sends them to the AI interview instead of booking; open it from their personal page
(`/p/{token}/ai-interview`). With `AI_FAKE=1`, answers under 40 characters get a follow-up and
scores follow answer length. Results and the blind review are under AI面接 in the sidebar.

Inbound mail needs `INBOUND_DOMAIN` and `INBOUND_WEBHOOK_SECRET` in `.env.local`. Issue the address
in 設定 → 受信, then post an email in Postmark's inbound format to
`/api/webhooks/inbound-email` with Basic auth (any user name, the secret as the password). A
notification from a board for one of the company's job titles appears in 書類選考 → 未エントリー;
an email from a candidate's address appears in the header's 応募者からの返信.

`/demo` works on the local stack too: each click on 管理画面を開く (in a browser without a session)
creates a sandbox company and a throwaway admin, both deleted after 24 hours by the hourly
`purge-demo-sandboxes` job. Sandboxes never email anyone. The applicants' documents come from
`src/features/demo/files/`; after changing the eval generator, rebuild them with
`PLAYWRIGHT_CHANNEL=chrome pnpm demo:files`.

Turnstile stays off until `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set.
To see the widget locally, use Cloudflare's published test keys (the "always passes" pair from
Cloudflare's Turnstile testing docs) in `.env.local` and restart `pnpm dev`.

## End-to-end tests

`pnpm test:e2e` runs the Playwright flows in `tests/e2e` against the running app: apply on a
phone, AI screening, a recruiter's pass, booking and rescheduling, in a fresh `/demo` sandbox.
Start the local stack as above (`pnpm env:local` sets `AI_FAKE=1`), `pnpm dev` and
`pnpm inngest:dev` first. `PLAYWRIGHT_CHANNEL=chrome` (or `msedge`) uses an installed browser;
otherwise run `pnpm exec playwright install chromium` once.

## AI evals

`pnpm eval` renders the 60 synthetic applications in `tests/ai-evals` (text PDFs, scans, phone
photos, handwritten forms, injection samples) and reads and screens them with the production code.
With `ANTHROPIC_API_KEY` it calls Claude (a full run costs roughly US$5–15), prints each target and
saves the results in `tests/ai-evals/results/`; commit them with the prompt or model change they
measured. `AI_FAKE=1 pnpm eval` checks the harness without the model. Rendering uses Playwright
too (`PLAYWRIGHT_CHANNEL` as above) and caches the files in `tests/ai-evals/.cache/`. The "AI
evals" workflow on GitHub runs the same thing by hand, with the key from the repository secrets.

## Before you push

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build
```

`pnpm test:db` runs the RLS and tenant-isolation tests. It writes to `auth.users`, so it only uses a
disposable database: the local stack (`pnpm db:start`) or `TEST_DATABASE_URL`, never your `.env`
database. CI runs every check on each pull request, including the database tests against a fresh
Postgres.

## Changing the database

1. Edit the Drizzle schema in `src/server/db/schema/`.
2. `pnpm db:generate --name <what-changed>` writes a migration into `supabase/migrations/`.
3. Functions, RLS policies, grants and triggers go in a custom migration:
   `pnpm db:new-sql --name <what-changed>`, then write the SQL.
4. Test it: `pnpm db:reset` and `pnpm test:db` on the local stack, or in CI.
5. `pnpm db:push` applies it to the hosted project.

Never edit a migration that has been applied to a hosted project; add a new one.

## Conventions

Project rules (tenancy, Server Actions, events, logging, copy) are in [CLAUDE.md](CLAUDE.md). The
architecture behind them is in [docs/05-architecture.md](docs/05-architecture.md).
