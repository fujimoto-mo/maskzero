# 06. Roadmap: mask0

The order follows the reference's own build sequence (its live product shipped ① jobs and intake and ② screening first, and labels ③ scheduling, ④ automation and analytics, ⑤ interviews as next). Each phase ends with something a recruiter can use on real applicants. Durations assume **1–2 full-stack developers**; re-plan after Phase 0.

| Phase | Goal | Reference | Length |
|-------|------|-----------|--------|
| **0 · Foundation** | Repo, stack, auth, tenancy, CI | – | 1–2 weeks |
| **1 · Intake & screening** | Jobs, entry links, entry page, AI screening, candidate list | ① ② (live) | 6–8 weeks |
| **2 · Booking & scheduling** | Invitations, availability, booking page, calendars, core emails | ③ | 4–6 weeks |
| **3 · Automation, analytics & team** | Full templates, inbound mail, analytics, roles, multi-client, billing | ④ | 5–7 weeks |
| **4 · Interviews** | Prep, notes, decisions, recording, AI report, live assist | ⑤ | 4–6 weeks + recording track |
| **5 · AI interviewer** | Asynchronous AI interview, feature-flagged | (planned) | 6+ weeks, R&D |

---

## Phase 0 · Foundation

Code status as of 2026-11-02: everything that runs locally is done and verified; the remaining items need accounts and DNS, which only you can set up.

- [ ] Pick the production domain and sending subdomain; set SPF, DKIM, DMARC
- [x] mask0 brand basics: wordmark, color tokens (indigo, light and dark), Geist + Noto Sans JP
- [x] Next.js 16 (App Router, TypeScript strict, Cache Components), Tailwind 4, shadcn/ui (Radix), next-intl (`ja`), ESLint, Prettier
- [x] Local Supabase (Tokyo-ready config), Drizzle, migrations for organizations, profiles, memberships, invitations, clients, events, audit_logs
- [x] App switched to a hosted Supabase project: `.env` template with blanks to fill, SSL for hosted connections, `pnpm db:link` / `pnpm db:push` for migrations, database tests kept on a disposable database
- [ ] Create the hosted Supabase project in Tokyo (`ap-northeast-1`), fill in `.env`, run `pnpm db:push`, and set the dashboard auth settings (site URL, redirect URLs, confirm email, 8-character passwords, custom SMTP), as listed in [CONTRIBUTING.md](../CONTRIBUTING.md#first-run-hosted-supabase)
- [ ] A second hosted project for production, once staging works
- [x] RLS helpers and policies, `withRls`, `getAdminDb`, cross-tenant test suite (26 tests, `pnpm test:db`)
- [x] Auth: sign-up with email confirmation, login, password reset, `/onboarding` (company → default client)
- [ ] Google sign-in: create the OAuth client, then enable it in Supabase and set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` (the button and flow are built)
- [x] Inngest and Resend wired: `org/created` → `send-welcome-email` (dry run until `RESEND_API_KEY` is set)
- [x] Sentry wired with PII scrubbing (inactive until `NEXT_PUBLIC_SENTRY_DSN` is set); `vercel.json` pins functions to `hnd1`; GitHub Actions CI
- [ ] Vercel project with preview deployments, Inngest Cloud app, Resend domain, Sentry project, CI secrets
- [x] `supabase/seed.sql` with a sandbox agency and three clients (synthetic candidates arrive with Phase 1 tables)
- [x] `CLAUDE.md` / `CONTRIBUTING.md`

**Exit:** a new user signs up, confirms the email, creates a company and lands on an empty dashboard; cross-tenant tests and CI are green. *Met locally on 2026-11-02 (browser walkthrough, 38 unit and 26 database tests); CI is written but has not run on GitHub yet.*

---

## Phase 1 · Intake & screening (reference ① ②)

| # | Work package | Spec |
|---|--------------|------|
| 1 | Landing page, contact form, `/privacy` `/terms` `/security` `/company`, SEO | M0 |
| 2 | Member invites (owner / member), profile, optional MFA | M1-3, M1-6 |
| 3 | Jobs: list, full editor with the shared Zod schema, posting checks, images, paste views, AI fill, statuses, sample job on sign-up | M2, M1-2 |
| 4 | Entry URLs (22 boards + custom) and the auto-reply text | M3-1, M3-2 |
| 5 | Entry page `/a/[code]` (4 steps, signed uploads, consent, dedupe) and personal page `/p/[token]` | M3-3 … M3-8 |
| 6 | Document reading in Inngest + Claude (transcript, profile, legibility) | M4-1, M4-12 |
| 7 | Criteria editor: basic and specialist conditions, required flag, weights, lines, toggles, presets, fairness guardrails | M4-2 … M4-6, M4-10 |
| 8 | Screening list, drawer, viewer, manual decisions, bulk confirm, re-screening | M4-7 … M4-9 |
| 9 | Candidate list, drawer, timeline, stage changes, manual add, CSV import / export, staff uploads | M5, M3-9 |
| 10 | Dashboard (counters, per board, trends, funnel, 14 days), notifications, ⌘K search | M6-1, M6-2, M6-4, M6-5 |
| 11 | Company settings (sender name, reply-to, retention), audit log, retention purge, PII encryption, data requests, AI usage metering | M13-1 … M13-4 |
| 12 | AI eval set v1 (≥ 50 labeled synthetic résumés incl. photos and injection samples) and runner | [05 §6.6](05-architecture.md#66-evals-before-the-first-pilot) |
| 13 | `/demo` sandbox with nightly reset | M0-4, M13-6 |

Code status as of 2026-11-03: work packages 1–13 are built and verified locally (browser walkthroughs and a Playwright run on the local Supabase stack, with the AI in fake mode). The eval set has not run against the real model yet. The exit criteria below need a staging deployment, an Anthropic API key and a pilot.

- [x] 1 · Landing page, `/security` `/company`, contact form → `POST /api/contact` (stored, notifies `CONTACT_NOTIFY_EMAIL`), sitemap, robots, OG image
- [ ] 1 · `/privacy` and `/terms` are drafts: fill the 【…】 placeholders in `src/messages/ja-marketing.json` with legal review, then remove them from `DRAFT_PAGES` (they are `noindex` until then); add `public/guide.pdf` for the materials download
- [x] 2 · Member invitations (`/invite/[token]`; sign-up keeps the link through email confirmation), profile, sign out everywhere
- [x] 2 · Optional TOTP MFA (built with Phase 3's two-factor authentication)
- [x] 3 · Jobs: list, editor with live checks, six images, Indeed / engage / other paste views, AI draft, statuses, sample job and conditions on sign-up
- [x] 4 · Entry URLs (22 boards + custom), entered counts, on/off, auto-reply text with `{URL}`
- [x] 5 · Entry page (4 steps, photo resizing, direct signed uploads, consent text that follows the job's settings, honeypot, timing check, rate limits) and personal page. A repeat entry never changes stored details and never shows the personal-page link on screen; the link is emailed
- [x] 5 · Turnstile on the entry page, the contact form and `/demo` (inactive until `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set; a Cloudflare outage lets forms through, the other checks still apply)
- [x] 6 · Inngest pipeline: verify bytes → read each document → screen; retries, a fallback to "needs review" when processing fails, and a sweep every 10 minutes for lost events. Untested against the real model until `ANTHROPIC_API_KEY` is set
- [x] 7 · Criteria editor with presets, required flag, weights, lines, toggles (turning off rejection confirmation is audited and changes the consent text), banned-topic block and age exceptions
- [x] 8 · Screening list with counts, drawer with reasons and verified quotes, transcripts, manual decisions, back to AI, bulk confirm, re-read, staff uploads
- [x] 9 · Candidate list (keyset pages, name or exact-email search), drawer with timeline, stage changes, manual add, CSV import (Shift_JIS / UTF-8) and export (UTF-8 BOM, audited), deletion
- [x] 10 · Dashboard counters, per board, 12 months vs last year, funnel, 14 days; notifications; ⌘K search
- [x] 10 · Average days per step in the funnel (on the analytics page, Phase 3 · 4)
- [x] 11 · Company settings, audit log viewer, nightly retention purge, data requests, AI usage per feature, PII encryption
- [x] 12 · AI eval set v1 (`tests/ai-evals`): 60 synthetic applicants for a sales and a care job, generated from a fixed seed and rendered as text PDFs, scanned PDFs, phone photos (two levels of degradation) and handwritten-style forms, with 7 injection samples. Labels come from the facts the documents are drawn from and the expected verdicts from `decide()`. `pnpm eval` reads and screens them with the production code (`readDocument`, `judgeApplication`) and scores false rejections, verdict agreement, injections caught, quote verification, transcript character error rate, latency and cost; a manual GitHub workflow runs it with the API key
- [ ] 12 · First live eval run (needs `ANTHROPIC_API_KEY`; roughly US$5–15), then tune prompts until the targets hold
- [x] 13 · `/demo`: every visitor gets their own sandbox (an agency with two clients, two jobs, applicants already screened, invited and booked, their documents and history) and a throwaway admin user, deleted after 24 hours by an hourly job. Sandboxes never email anyone, skip the second factor (only server code can make a company a sandbox), can't invite members and have a small AI budget. The candidate view is the sandbox's real entry page, with a sample résumé to upload
- [x] Playwright E2E (`tests/e2e`, `pnpm test:e2e`): apply on a phone → AI screening → recruiter passes → booking confirmed at once → reschedule cancels the first interview; runs locally against a fresh `/demo` sandbox
- [ ] Apply the Phase 1 migrations to the hosted project (`pnpm db:push`)

**Exit**
- Playwright E2E on staging: *apply on a phone → AI verdict → recruiter passes or confirms the rejection*. *The test exists and passes locally (2026-11-03); it still has to run on staging.*
- Evals: 0 false rejections on required conditions, ≥ 85 % verdict agreement, 100 % of injection samples in `check`.
- One pilot (an agency with 1–2 clients, or an in-house team) runs a real job with the privacy policy and consent text in place. At this point mask0 matches the reference's live product.

---

## Phase 2 · Booking & scheduling (reference ③)

| # | Work package | Spec |
|---|--------------|------|
| 1 | Interview invitations, "to interview" list, resend, automatic follow-up | M7 |
| 2 | Availability rules, month calendar, overrides, free-slot engine (pure, tested) | M8-1, M8-2 |
| 3 | Booking page (≤ 3 picks, concerns, memo), auto / manual confirmation, reschedule, cancel, withdraw, no-show | M8-3 … M8-5, M3-8 |
| 4 | Interview tool: fixed URL first, then Google Calendar + Meet, Zoom, Teams (submit Google OAuth verification at the start of this phase) | M8-6, M8-7 |
| 5 | Core emails: invitation, follow-up, confirmation with `.ics`, day-before reminder, rejection; basic template editing; send log; quiet hours; test mode | M9-1, M9-3 (basic), M9-5, M9-6 |
| 6 | Dashboard: today's interviews, pending requests; notifications for confirmed and tomorrow's interviews | M6-3, M6-4 |

Code status as of 2026-11-04: work packages 1–6 are built, including the Google Calendar, Meet, Zoom and Teams integrations, which stay unavailable until their OAuth apps are set up. Verified on the local Supabase stack with the Inngest dev server and the AI in fake mode.

- [x] 1 · Invitation on pass and on "next round" (one per round), "to interview" list with the people who need action first, booking link to copy, resend, two follow-ups three days apart while nothing is booked
- [x] 2 · Rules (common and per-weekday hours, first and later round lengths, buffer, weekends, holidays, booking window, notice, change cutoff), month calendar with per-slot overrides, free-slot engine (pure, unit-tested, Japanese holidays)
- [x] 3 · Booking page (up to three picks in order, concerns with the company's answers, memo); automatic confirmation of the first free pick, or confirmation by staff; reschedule and withdraw from the personal page; staff mark done, no-show or cancel. Overlaps are impossible: an exclusion constraint per calendar, and bookings on one calendar take turns under an advisory lock
- [x] 4 · Fixed meeting URL or on-site address
- [x] 4 · Google Calendar + Meet, Zoom, Teams (設定 → 連携, then the tool on 日程調整): interviews go into the linked Google calendar, its busy times are kept out of the offered slots, and Meet, Zoom or Teams links are created per interview before the confirmation email; a cancellation removes them. Verified locally with `INTEGRATIONS_FAKE=1` and unit tests against stubbed provider APIs
- [ ] 4 · Create the Google, Zoom and Microsoft OAuth apps (redirect URIs in `.env.example`) and submit Google's verification for the Calendar and Gmail scopes; then try each provider for real
- [x] 5 · Emails: invitation, follow-ups, confirmation with `.ics`, reminder at 18:00 the day before, rejection at 10:00 the next morning; template editing with merge-field checks and a preview; send log with delivery and bounce status from the Resend webhook; quiet hours 21:00–08:00 for automatic sends; test mode
- [x] 6 · Dashboard: today's interviews and a "日程の確定待ち" counter; notifications for booking requests, unmatched requests, confirmed interviews and tomorrow's interviews
- [ ] Apply the Phase 1 and Phase 2 migrations to the hosted project (`pnpm db:push`), then add the Resend webhook and `RESEND_WEBHOOK_SECRET`

**Exit:** E2E *pass → invitation → booking → auto-confirm → reminder scheduled → reschedule cancels the old reminder* is green, and a concurrency test produces zero double bookings. *Partly met locally on 2026-11-03:* the flow passed as a manual browser walkthrough (the reminder run was waiting, and the reschedule cancelled it), and `tests/db/booking.test.ts` books one slot from eight concurrent requests exactly once. The flow is now the Playwright test `tests/e2e/hiring.spec.ts` (local; staging pending).

---

## Phase 3 · Automation, analytics & team (reference ④)

| # | Work package | Spec |
|---|--------------|------|
| 1 | Full template editor, all triggers (5- and 3-day nurture with concern answers, interview day, thanks, CV missing, next round, no-show, custom) | M9-2, M9-3 |
| 2 | Gmail "send as" after OAuth verification | M9-4 |
| 3 | Inbound address, per-board notification parsers, "not yet entered" list and nudge text, candidate replies and a messages panel | M3-10, M3-11 |
| 4 | Analytics page | M10 |
| 5 | Roles, client scoping, client switcher, clients page; MFA required for admins | M1-4, M1-5, M1-6 |
| 6 | Notification preferences and email notifications | M6-4 |
| 7 | Talent pool and consent page | M5-6, M3-8 |
| 8 | Billing and plan limits | M13-4, M13-5 |
| 9 | Virus scanning of uploads, penetration test, explainer video, optional English UI | [05 §11](05-architecture.md#11-security-checklist) |

Code status as of 2026-11-04: work packages 1–7 are built (2 waits for Google's OAuth verification to be used outside the company's own Workspace); 8 has plan limits and a usage page but no billing; 9 is not started. Verified on the local Supabase stack with the Inngest dev server.

- [x] 1 · All triggers: invitation, follow-ups, next round, confirmation, reminders 5 and 3 days before (with the answers to the candidate's concerns), the day before and on the day, thanks, no-show, rejection, CV missing, talent-pool suggestion. Company-chosen timing where it makes sense, per-client wording for agencies, and custom emails (what they follow, when, wording)
- [x] 2 · Gmail sender: candidate emails from the connected Google account through the Gmail API (`gmail.send`), with mask0's sender as the fallback when Gmail refuses; the send log marks which emails went through Gmail
- [x] 3 · Inbound address per company and webhook (Postmark's inbound JSON, Basic auth); job-board notifications become "not yet entered" records, matched when the person enters; nudge text to paste; candidate replies on a messages page, in the timeline and the bell; unmatched mail kept for admins and deleted after 90 days
- [ ] 3 · Board parsers tuned on real notification emails: today boards are recognised by sender domain or name, and names and jobs by common phrasings and the company's job titles
- [x] 4 · Analytics: period, cohort funnel with the weakest step and a suggestion, response speed against interview rate, per board, open rate by send hour, days per step
- [x] 5 · Role and client scope per member and on invitations, clients page, client switcher; TOTP two-factor authentication, required for owners and admins (and for anyone who set it up)
- [x] 5 · Interviewers limited to their own interviews, enforced in RLS once Phase 4 added interviewer assignment (Phase 4 · 1)
- [x] 6 · Per-member email notifications (new application, needs review, booking requests, confirmed interviews, replies, a daily digest of tomorrow's interviews at 18:00)
- [x] 7 · Talent pool (opted-in candidates, suggest a published job of any client once; the email carries a talent-pool entry URL) and a consent page with one-click opt-out
- [x] 8 · Plan limits for clients, published jobs and monthly AI spend (screening pauses into "needs review" at the cap) and a usage page. The numbers in `src/features/billing/plans.ts` are placeholders until pricing is set
- [ ] 8 · Billing (invoices, then cards)
- [ ] 9 · Virus scanning, penetration test, explainer video, English UI
- [ ] Apply the Phase 1–3 migrations to the hosted project (`pnpm db:push`); set `INBOUND_DOMAIN` and `INBOUND_WEBHOOK_SECRET` and point the provider's inbound webhook at `/api/webhooks/inbound-email`

**Exit:** a feature-by-feature walkthrough against [07-parity-checklist.md](07-parity-checklist.md) shows parity with the demo except interviews; at least three paying orgs; delivery rate ≥ 98 %.

---

## Phase 4 · Interviews (reference ⑤)

| # | Work package | Spec |
|---|--------------|------|
| 1 | Interview day list and workspace; prep tab with AI questions; notes and rating; decisions with undo | M11-1 … M11-4 |
| 2 | Recording bot, transcript, consent flow | M11-5 |
| 3 | AI interview report | M11-6 |
| 4 | Live assist | M11-7 |

Code status as of 2026-11-04: work packages 1–4 are built; the meeting bot (2) and live assist (4) need a Recall.ai account to run for real. Verified on the local Supabase stack with the Inngest dev server and the AI in fake mode.

- [x] 1 · Day list (`/meetings`) and interview workspace (`/meetings/[id]`): interviewer assignment, document highlights, the round's purpose, AI question suggestions (standard or deep) to pick, reorder, edit, add to and print; per-interviewer ratings on a five-criterion rubric with notes and a recommendation; decisions (offer, next round, fail, withdrawn) that move the application at once and hold every email for a 10-minute undo window
- [x] 1 · Interviewers see only the interviews they run, enforced in RLS (completes M1-4); decisions stay with editors, interviewers give their recommendation
- [x] 2 · Transcripts uploaded from the meeting tool (WebVTT, SRT, text), stored encrypted; a company setting announces recording in the confirmation email, and candidates can decline on their consent page, which blocks transcripts for their interviews
- [x] 2 · Meeting bot (Recall.ai) for Meet / Zoom / Teams: joins online interviews when the company records interviews and the candidate hasn't declined, streams Japanese speech-to-text (Deepgram through Recall) to a webhook, and after the interview its transcript feeds the AI report automatically. Verified locally with the fake bot, which replays a sample interview
- [ ] 2 · A Recall.ai account (`RECALL_API_KEY`, Tokyo region) with the Deepgram key added in its dashboard; then a real Meet, Zoom and Teams interview each
- [x] 3 · AI report from the transcript: per-criterion score with quotes checked against the transcript and their times, summary, the candidate's needs, rank among the same job and round, shown next to the interviewers' ratings
- [x] 4 · Live assist (`meetings/[id]/live`): the rolling transcript and up to four suggestions (deep-dive, inconsistency, skill check, missed topic) refreshed every 15–45 seconds from the transcript, the job, the round's purpose, the prepared questions and the candidate's booking concerns
- [ ] The rubric is fixed in code (`src/features/interviews/rubric.ts`); per-job rubrics later
- [ ] Apply the migrations to the hosted project (`pnpm db:push`)

**Exit:** interviewers rate at least 80 % of AI reports "usable as is or with small edits" in pilot interviews.

---

## Phase 5 · AI interviewer (R&D, feature-flagged)

| # | Work package | Spec |
|---|--------------|------|
| 1 | Asynchronous text interview from the personal page: question set, follow-ups, rubric, per-question scores and band, reminders | M12 |
| 2 | Voice mode once text quality is proven | M12-2 |
| 3 | Bias and quality review with recruiters; human review of every outcome; legal review | M12-4 |

Code status as of 2026-11-03: work package 1 is built and the tooling for 3 is in place; 2 is not started. Everything sits behind the `ai_interviewer` feature flag on `organizations.feature_flags`, which only mask0 staff set (no grant for app users). Verified on the local Supabase stack with the Inngest dev server and the AI in fake mode.

- [x] 1 · Per job (求人 → AI面接): round 1 becomes an AI interview with up to 10 questions, each with its evaluation guidance and 0–2 AI follow-ups, a time limit and a deadline in days; sample questions to start from
- [x] 1 · A pass (AI or manual) invites to the AI interview instead of booking when the job uses one; the invitation email and reminders two days before and on the deadline day are new editable templates (設定 → メール → AI面接)
- [x] 1 · The candidate takes it from the personal page: what the AI does and doesn't do, explicit consent (recorded as `ai_interview`), a chat with a countdown, follow-ups worded by the AI and capped by the question, and a human interview on request at any point (it becomes the usual booking invitation)
- [x] 1 · The conversation is stored encrypted; an interview left open closes with what was answered when its time runs out, an unstarted one expires at the deadline and goes to staff (re-invite once, or invite to a person)
- [x] 1 · Scoring after completion: per-question 1–5 scores with quotes checked against the answers, average and A–D band, summary; injection attempts and partial interviews are flagged; scoring failures leave the answers with a person. The application then waits for staff, who decide on the candidate as usual (next round, reject); an AI score never rejects anyone
- [x] 3 · Blind review (AI面接 → ブラインド評価): recruiters rate scored interviews without the candidate's name or the AI's scores, then see the comparison; the AI面接 list shows band agreement against the 80 % target and the mean score gap
- [x] 3 · Human review of every outcome: scored interviews wait for staff (`review_ai_interview`), with in-app and email notifications
- [ ] 2 · Voice mode (needs speech-to-text and text-to-speech providers)
- [ ] 3 · Bias review with recruiters on real pilot data, completion-rate tracking, and legal review (counsel); not code
- [ ] Apply the migrations to the hosted project (`pnpm db:push`) and set the flag for pilot companies with SQL

**Exit:** recruiters agree with the AI evaluation in ≥ 80 % of a blind sample, completion rates are acceptable, and counsel has signed off.

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI false rejections or bias | Legal, reputational | Human confirmation of rejections, blind screening, quote verification, fairness guardrails, evals with a zero false-reject target |
| Prompt injection in uploaded documents | Manipulated verdicts | Documents only as delimited user content, injection flag + heuristic → `check`, quote verification |
| Japanese carrier mail filtering | Candidates miss invitations | Personal page as the source of truth, "allow our domain" notes, DMARC alignment, bounce monitoring |
| Google OAuth verification takes weeks | Calendar / Gmail features slip | Fixed meeting URLs and the mask0 sender work without it; submit verification early |
| Job boards change notification formats | Inbound parsing breaks (P3) | Entry URLs keep working regardless; per-board parser fixtures and alerts |
| Double bookings | Bad candidate experience | Exclusion constraint + transactional auto-confirm |
| Breach of résumés | Severe | RLS + app guard, encrypted PII, private storage, audit log, retention purge, penetration test |
| AI cost overrun | Margin | Prompt caching, Batch API for re-screening, per-org metering and limits |
| Copying the reference too closely | IP dispute | Original copy, design and assets ([01 §11](01-reference-site-analysis.md#11-originality-rules-for-mask0)); legal review |
| Scope creep (AI interviewer, live assist) | Late MVP | Strict phase gates; P4 / P5 behind feature flags |

---

## Immediate next steps

As of 2026-11-04 everything up to Phase 5's text interviewer is built and passes locally, including the calendar, meeting, Gmail and meeting-bot integrations the sales deck describes. What stands between the code and the first pilot:

1. Hosted infrastructure: the Tokyo Supabase project has every migration as of 2026-11-11, and the Playwright flow passes against it from a local app; still to do are its dashboard auth settings, Vercel (functions in the Tokyo region, next to the database), Inngest Cloud, the Resend domain with SPF, DKIM and DMARC, Sentry and Turnstile keys (see Phase 0).
2. The first live eval run (`pnpm eval`, or the "AI evals" workflow with `ANTHROPIC_API_KEY`), then prompt changes until the targets hold.
3. The Playwright flow on staging, and a walkthrough of `/demo` there.
4. Legal review of the privacy policy and terms (Phase 1 · 1), then a pilot company.
5. Accounts for the integrations: Google, Zoom and Microsoft OAuth apps (start Google's verification early: it takes weeks) and Recall.ai with Deepgram. Until then those features show as not yet available.
