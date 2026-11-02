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
   (`DATABASE_URL`), the project ref and the database password.
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
