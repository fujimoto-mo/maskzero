# mask0

**mask0** is an AI recruiting platform for **recruitment agencies (採用支援会社・RPO) and in-house HR teams** in Japan. Recruiters set the screening criteria and their interview availability. mask0 reads every application, scores it against those criteria, invites the people who pass to book an interview, and sends the confirmations and reminders. People make every final decision.

The functional reference is **lista.** ([lista-hr.com](https://lista-hr.com/), run by lim force LLC). mask0 rebuilds the same functions and page structure under its own name, copy and design.

> **mask0 is not a job board.** Candidates never search for jobs here. Jobs stay on Indeed, engage and the other job boards. mask0 takes over **after** someone applies there: the board's auto-reply sends the applicant a mask0 entry link, and everything from document screening to the interview happens in mask0.

## Documents

| # | Document | What's inside |
|---|----------|---------------|
| 01 | [Reference analysis](docs/01-reference-site-analysis.md) | Everything on lista-hr.com and app.lista-hr.com: landing page, interactive demo, the live product, candidate pages, API surface, what's built vs. planned, weak spots |
| 02 | [Feature specification](docs/02-feature-spec.md) | mask0 requirements per module, with phase and acceptance criteria |
| 03 | [Sitemap and routes](docs/03-sitemap-and-routes.md) | Every mask0 URL: marketing, staff app, candidate pages, API, webhooks |
| 04 | [Data model](docs/04-data-model.md) | Tables, enums, state machines, events, RLS, retention |
| 05 | [Architecture and best practices](docs/05-architecture.md) | Stack, repository layout, tenancy, AI pipeline, jobs, uploads, email, security, Japanese compliance |
| 06 | [Roadmap](docs/06-roadmap.md) | Build order in phases 0–5, exit criteria, risks, next steps |
| 07 | [Parity checklist](docs/07-parity-checklist.md) | Every reference page and feature mapped to a mask0 route and phase, ready to tick off |

## The recommendation on one page

**Build order:** the order the reference itself shipped in, so every phase is usable on real applicants:

| Phase | Delivers |
|-------|----------|
| 0 | Repo, auth, tenancy, CI |
| 1 | Job postings with per-board paste views, entry links, mobile entry page, AI document screening, candidate list (= the reference's live product today) |
| 2 | Interview invitations, availability, booking page, calendars, core emails |
| 3 | Full email automation, inbound job-board mail, analytics, roles and multi-client, billing |
| 4 | Interviews: prep, notes, recording, AI report, live assist |
| 5 | AI interviewer (research track, behind a flag) |

**Stack:** Next.js (App Router, TypeScript) on Vercel with Tokyo functions · Supabase Postgres, Auth and Storage in Tokyo · Drizzle ORM with Row Level Security as a second guard · Inngest for every background step · Resend for email · Claude API (`claude-opus-5-5`) for reading documents and screening · Sentry.

**Design rules:**
1. The AI reads and quotes; **code computes scores and verdicts**.
2. **No automatic rejections** by default: a person confirms every rejection.
3. Every AI reason carries a **verbatim quote that the server verifies** against the document.
4. Documents are data, not instructions: suspected **prompt injection goes to a person**.
5. **Tenant isolation twice**: explicit filters in the app plus RLS in the database.
6. Every asynchronous step runs in a **durable queue**, never in a browser tab.
7. Candidates **never log in**: one hashed, expiring token per application.
8. **No job-board APIs needed**: entry links, CSV import and forwarded notification emails.

**Where mask0 should beat the reference:** durable processing instead of browser-triggered jobs; direct-to-storage uploads (10 MB PDFs); a forwarding inbound address instead of Gmail mailbox access; a privacy policy, terms and SEO basics from day one; roles, client scoping and MFA early; a demo that runs on the real app; posting checks for Japanese labor-law disclosures.

## Status

**Phases 0–2 and most of Phases 3–4 are built and run locally:** the foundation (accounts, companies, Row Level Security, background jobs, CI); intake and AI screening (jobs, entry URLs, the entry and personal pages, document reading, criteria, the screening and candidate lists, the dashboard); and booking (invitations, availability rules and calendar, the booking page with automatic or manual confirmation, reschedule and withdraw, confirmation emails with `.ics`, reminders, follow-ups, templates and a send log). Phase 3 adds every candidate email trigger with timing and custom emails, an inbound address for job-board notifications and replies, analytics, roles and client scope with a client switcher, two-factor authentication for admins, email notifications for staff, a talent pool, and plan limits. Phase 4 adds the interview workspace: a day list, AI question suggestions to prepare with, per-interviewer ratings, decisions with an undo window, uploaded transcripts and an AI interview report; interviewers see only the interviews they run. Phase 5's text AI interviewer is built behind a feature flag: round 1 by chat from the personal page with AI follow-ups, a human interview on request, scoring with checked quotes for people to review, and a blind-review tool that measures how often recruiters agree with the AI. For the first pilot there is now an AI eval set (60 synthetic applications as PDFs, scans, phone photos and handwritten forms, with injection samples) and its runner, a `/demo` that gives every visitor their own sandbox company for 24 hours, Turnstile on the public forms, and a Playwright test of the apply → screen → pass → book → reschedule flow. Companies can connect Google, Zoom and Microsoft in 設定 → 連携: interviews then go into Google Calendar (its busy times are kept out of the offered slots), each interview gets its own Meet, Zoom or Teams link in the confirmation email, and candidate emails can go out from the recruiter's Gmail. An AI meeting bot (Recall.ai) joins online interviews to transcribe them, suggests follow-up questions on a live page while the interview runs, and hands its transcript to the AI report. These integrations need their OAuth apps and a Recall.ai account; locally, `INTEGRATIONS_FAKE=1` stands in for them. Accounts on Supabase, Vercel, Inngest, Resend and Sentry still have to be created before the first deployment. What's left per phase is in the [roadmap](docs/06-roadmap.md).

The reference analysis was checked against the live site on **2026-11-02**. The reference changed after the first review on 2026-10-29 (a live product appeared at `app.lista-hr.com`); see [01 §1](docs/01-reference-site-analysis.md#what-changed-since-the-first-crawl-2026-10-29).

## Development

The app runs against a hosted Supabase project (Tokyo region). Fill in `.env` (each value's location is noted in [.env.example](.env.example)), then:

```bash
pnpm install
supabase login && pnpm db:link && pnpm db:push   # apply the migrations to your project
pnpm dev                                         # http://localhost:3000
```

Dashboard settings, the optional local Docker setup, checks and the database workflow: [CONTRIBUTING.md](CONTRIBUTING.md). Project rules: [CLAUDE.md](CLAUDE.md).
