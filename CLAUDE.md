# mask0: notes for Claude Code

@AGENTS.md

AI recruiting platform for Japanese recruitment agencies and in-house HR teams. Product and plan:
[README.md](README.md) and [docs/](docs/). Phase 0 (foundation) is built; Phase 1 is next
([docs/06-roadmap.md](docs/06-roadmap.md)).

## Commands

The app uses a **hosted Supabase project**, configured in `.env` (template: `.env.example`). The
local Docker stack is optional and is what the database tests run against.

| Command | What it does |
|---------|--------------|
| `pnpm dev` | App on http://localhost:3000 |
| `pnpm db:link` / `pnpm db:push` | Link to `SUPABASE_PROJECT_REF` / apply new migrations to the hosted project (never the seed) |
| `pnpm db:start` / `pnpm db:stop` | Optional local Supabase in Docker (API :54321, Postgres :54322, Studio :54323, Mailpit :54324) |
| `pnpm db:reset` | Recreate the local database from `supabase/migrations` + `supabase/seed.sql` |
| `pnpm env:local` | Write `.env.local` (overrides `.env`) from the running local stack; delete it to go back to hosted |
| `pnpm inngest:dev` | Inngest dev server on http://localhost:8288 |
| `pnpm typecheck` · `pnpm lint` · `pnpm format` | Checks (CI runs `format:check`) |
| `pnpm test` | Unit tests (`tests/unit`) |
| `pnpm test:db` | RLS and tenant-isolation tests (`tests/db`) on the local stack or `TEST_DATABASE_URL`; they write to `auth.users`, so never point them at the hosted project |
| `pnpm db:generate --name <name>` | Migration from changes in `src/server/db/schema` |
| `pnpm db:new-sql --name <name>` | Empty migration for functions, policies, grants, triggers |

## Rules

- **Tenancy.** Staff-facing queries run inside `withRls(ctx, (tx) => …)` (`src/server/db/rls.ts`) and
  still filter by org and client explicitly. `getAdminDb()` bypasses RLS: only for background jobs,
  webhooks and candidate token endpoints, always filtered by the `orgId` they were given.
- **New tables** get `org_id` (and `client_id` when client-owned), then RLS, policies and grants in a
  custom migration. `tests/db/rls.test.ts` fails for any public table without RLS; add isolation
  tests for the new table there.
- **Server-only SQL functions go in the `private` schema**, never `public`: Supabase serves `public`
  over REST to anyone with the anon key. A test pins the list of functions allowed in `public`.
- **Server Actions:** authenticate → authorize → validate with Zod → one transaction (write + event)
  → enqueue the Inngest event → revalidate. Pure logic belongs in `features/*/domain.ts` with tests.
- **Inngest events carry IDs only.** Look personal data up inside the step that uses it, so it never
  lands in Inngest's stored payloads or step results.
- **No personal data in logs or Sentry.** `src/lib/sentry.ts` scrubs emails and phone numbers.
- **UI text** lives in `src/messages/ja.json` (keys are type-checked). Write original Japanese copy;
  never reuse lista-hr.com wording or assets ([docs/01 §11](docs/01-reference-site-analysis.md#11-originality-rules-for-mask0)).
- Server Components can't pass functions to Client Components, icon components included: pass an
  element (`icon={<SomeIcon />}`).

## Next.js 16 and Cache Components

`cacheComponents` and `partialPrefetching` are on. Read the bundled docs in
`node_modules/next/dist/docs/` before using an API you haven't checked; several changed in 16.

- Reading cookies, headers, `params` or `searchParams` outside `<Suspense>` fails the build unless
  the segment exports `instant = false`. Staff and auth pages block for now: each page or layout
  that reads the session or params exports `instant = false` (a layout-level `false` alone doesn't
  cover navigations between its child pages).
- `getSessionUser()` calls `connection()` first, so time reads (token expiry, greetings) never run
  during prerendering.
- Making navigations instant later means moving session reads behind `<Suspense>` and
  `use cache: private`; see `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.
- Next keeps recently visited routes mounted (hidden) during client navigation. Sign-out is
  therefore a plain form POST to `/auth/sign-out`, which forces a full page load.
- Middleware is `src/proxy.ts` (renamed in 16). It only refreshes the Supabase session cookie;
  pages and actions do their own authorization.

## Known issues

- The local Supabase Postgres image used by CLI 2.101 (17.6.1.106) segfaults when a role calls a
  function it has no EXECUTE privilege on. Keeping server-only functions in `private` avoids it
  (schema-level denials don't crash). Re-check after upgrading the Supabase CLI.
