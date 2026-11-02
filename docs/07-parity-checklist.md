# 07. Parity checklist: reference → mask0

Every page and feature found on the reference ([01](01-reference-site-analysis.md)), mapped to its mask0 route or module and phase. Change ☐ to ✅ as features ship. ★ marks additions the reference doesn't have.

Source column: **LP** = lista-hr.com, **Demo** = /demo/, **Live** = app.lista-hr.com.

## A. Marketing site

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Header nav (features, results, FAQ, log in, contact) | LP | `/` header | P1 | ☐ |
| Hero with 3 steps, CTAs, demo link, animated AI activity widgets | LP | `/` hero | P1 | ☐ |
| Pain points (5) | LP | `/` | P1 | ☐ |
| Workload math (manual tasks per job) | LP | `/` | P1 | ☐ |
| 3 steps: you do / AI does | LP | `/#solution` | P1 | ☐ |
| Explainer video | LP | `/` | P3 | ☐ |
| Feature details 01–03 with screenshots | LP | `/` | P1 | ☐ |
| Before / after | LP | `/#change` | P1 | ☐ |
| Extra features (nurture, per-client, analytics) | LP | `/` | P1 | ☐ |
| Who it's for (agency / in-house) | LP | `/` | P1 | ☐ |
| Candidate experience (4 phone screens) | LP | `/` | P1 | ☐ |
| Getting started (3 steps) | LP | `/#flow` | P1 | ☐ |
| Data protection (4 points) | LP | `/` + `/security` | P1 | ☐ |
| FAQ (6) | LP | `/#faq` | P1 | ☐ |
| Contact form, download / consult modes, honeypot, 429 handling | LP | `/#contact`, `/api/contact` | P1 | ☐ |
| Guide PDF after submit | LP | `/guide.pdf` | P1 | ☐ |
| Closing CTA, footer, floating mobile CTA bar | LP | `/` | P1 | ☐ |
| Interactive demo (admin + candidate) | Demo | `/demo` on a real sandbox | P1 | ☐ |
| ★ Privacy policy, terms, company page | – | `/privacy`, `/terms`, `/company` | P1 | ☐ |
| ★ robots.txt, sitemap, JSON-LD, absolute OG image | – | metadata routes | P1 | ☐ |

## B. Sign-in, onboarding, team

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Log in with email + password | Live | `/login` | P0 | ☐ |
| Sign up with email confirmation | Live | `/signup`, `/signup/check-email` | P0 | ☐ |
| Forgot / reset password | Live | `/forgot-password`, `/reset-password` | P0 | ☐ |
| Register company → sample job | Live | `/onboarding` | P0 / P1 | ☐ |
| ★ Google sign-in | – | `/login` | P0 | ☐ |
| Members (single user today in Live; roles in Demo) | Live / Demo | `settings/members` (invites P1, roles P3) | P1 / P3 | ☐ |
| Client switcher (4 clients in Demo) | Demo | header + `/app/[org]/[client]` | P3 | ☐ |
| 2-step verification (planned in Live) | Live | `settings/profile` MFA | P1 / P3 | ☐ |

## C. Staff app

### Dashboard

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Greeting + quick actions with counters | Demo / Live | `dashboard` | P1 | ☐ |
| Applications per job board (cards, drill into jobs) | Demo / Live | `dashboard` | P1 | ☐ |
| This month vs. last month; 12-month trend vs. last year | Live | `dashboard` | P1 | ☐ |
| Funnel with conversion and average days | Demo / Live | `dashboard` | P1 | ☐ |
| Daily applications, 14 days, week over week | Demo / Live | `dashboard` | P1 | ☐ |
| Today's interviews | Demo | `dashboard` | P2 | ☐ |
| Monthly interview goal | Live | `dashboard` | P3 | ☐ |

### Job postings

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Job cards (pay, period, images, readiness, entry URLs) | Live | `jobs` | P1 | ☐ |
| Editor: 8 sections, Indeed + engage superset, board tags, counters | Demo / Live | `jobs/[jobId]?tab=edit` | P1 | ☐ |
| Pre-posting checks (red / yellow) | Demo / Live | `features/jobs/domain.ts` | P1 | ☐ |
| ★ Checks for scope of changes, fixed overtime, minimum wage | – | same | P1 | ☐ |
| Images: 6 slots, specs, captions, main image | Live | `?tab=images` | P1 | ☐ |
| Paste into Indeed / engage / other boards | Demo / Live | `?tab=indeed\|engage\|other` | P1 | ☐ |
| AI fill of empty fields | Live | Server Action + `job-fill` | P1 | ☐ |
| Draft / published / stopped / delete | Demo / Live | `jobs` (delete only without applicants, else archive ★) | P1 | ☐ |
| ★ Duplicate a job | – | `jobs` | P1 | ☐ |

### Screening

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Job picker, filter tabs, table, NEW badge | Demo / Live | `screening` | P1 | ☐ |
| Basic conditions: choices / dropdown / range; form or résumé source | Demo / Live | `screening/criteria` | P1 | ☐ |
| Required flag | Live | same | P1 | ☐ |
| Specialist conditions (AI match + quote) | Demo / Live | same | P1 | ☐ |
| Weights: equal or custom, total 100 | Demo / Live | same | P1 | ☐ |
| Pass and fail lines | Demo / Live | same | P1 | ☐ |
| Toggle: judge automatically | Demo / Live | same | P1 | ☐ |
| Toggle: person confirms before rejection | Demo / Live | same | P1 | ☐ |
| Presets ("commonly used conditions") | Demo / Live | same | P1 | ☐ |
| Banned topics blocked; age needs a legal exception | Live | same | P1 | ☐ |
| Drawer: score ring, per-criterion results, quotes, entry answers, documents | Demo / Live | `screening?a=` | P1 | ☐ |
| Document viewer with the quotes used | Demo / Live | drawer viewer | P1 | ☐ |
| Pass / fail / review / back to AI; bulk confirm rejections | Demo / Live | drawer + list actions | P1 | ☐ |
| Re-read with AI; staff upload on candidate's behalf | Live | drawer | P1 | ☐ |
| Re-score when criteria change (passed people keep going) | Demo / Live | `rescreen-job` | P1 | ☐ |
| Injection in document → needs review | Live | `screen` + domain | P1 | ☐ |
| Quote not found in document → needs review | Live | domain | P1 | ☐ |
| ★ Blind screening (mask name, contact, birth date) | – | `server/ai` | P1 | ☐ |
| "Not yet entered" list + nudge text | Demo | `screening/waiting` | P3 | ☐ |

### Candidates

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| List with stage filters, columns, search | Demo / Live | `candidates` | P1 | ☐ |
| Drawer: pipeline steps, current status, next action, timeline with actors | Demo / Live | `candidates?a=` | P1 | ☐ |
| Waiting on (candidate / staff / system), next automatic action | Demo | drawer | P1 | ☐ |
| Manual stage change | Live | drawer | P1 | ☐ |
| Add applicant by hand | Live | drawer / modal | P1 | ☐ |
| CSV import (Shift_JIS / UTF-8, header detection, preview, dedupe, report) | Live | `candidates/import` | P1 | ☐ |
| CSV download | Demo / Live | `/api/export/candidates.csv` (UTF-8 BOM ★) | P1 | ☐ |
| Delete candidate | Live | drawer (admin, audited) | P1 | ☐ |
| Talent pool (opted-in candidates for other clients) | Demo (consent URL) | `candidates` | P3 | ☐ |

### Interview candidates (面接予定者)

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| List sorted by action needed | Demo | `interview-candidates` | P2 | ☐ |
| Link state: sent / opened / booked | Demo | same | P2 | ☐ |
| Copy link, resend (email or board message text) | Demo | same | P2 | ☐ |
| Contact timeline | Demo | drawer | P2 | ☐ |
| Automatic follow-up (3 days, max 2) | Demo | `invitation-follow-up` | P2 | ☐ |

### Scheduling (日程調整)

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Month calendar, per-day hourly slots (08:00–22:00), open / close | Demo | `schedule` | P2 | ☐ |
| Availability rules: common hours, per-weekday, weekends, holidays, 42-day window | Demo | `schedule/availability` | P2 | ☐ |
| Pending requests, auto-confirm | Demo | `schedule` | P2 | ☐ |
| Google Calendar connection | Demo | `settings/integrations` | P2 | ☐ |
| Interview tool: Meet / Zoom / Teams / fixed URL | Demo | `settings/scheduling` | P2 | ☐ |
| AI recorder on/off + display name | Demo | `settings/scheduling` | P4 | ☐ |

### Interviews (面接)

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Day list (1st / 2nd round) | Demo | `interviews` | P4 | ☐ |
| Prep: document highlights, purpose, AI questions, standard / deep | Demo | `interviews/[id]?tab=prep` | P4 | ☐ |
| Live assist: transcript, suggestion types, detected needs | Demo | `?tab=live` | P4 | ☐ |
| Report: evaluation, report, recording with clickable transcript, summary, comparison | Demo | `?tab=report` | P4 | ☐ |
| Decision: pass / next round / fail with undo | Demo | workspace (manual stage change covers P2–P3) | P4 | ☐ |

### Analytics (分析)

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Period selector | Demo | `analytics` | P3 | ☐ |
| Detailed funnel, worst step + hint | Demo | same | P3 | ☐ |
| Invite → open lag vs. interview rate; open → booking time | Demo | same | P3 | ☐ |
| Per job board comparison | Demo | same | P3 | ☐ |
| Open rate by send hour; days per stage | Demo | same | P3 | ☐ |

### Settings and header

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Entry URLs per job × board (22 boards + custom), copy, preview, on/off, entered count | Demo / Live | `settings/entry-urls` | P1 | ☐ |
| "Notified by board" count | Demo / Live (planned) | inbound address | P3 | ☐ |
| Auto-reply text with `{URL}`, copy per job × board | Demo / Live | `settings/entry-urls` | P1 | ☐ |
| Document retention days (30–730) | Live | `settings/company` | P1 | ☐ |
| Company name, sender display name, reply-to | Live | `settings/company` | P1 | ☐ |
| Automated email templates | Demo | `settings/templates` | P2 / P3 | ☐ |
| Custom automated email (when + timing) | Demo | `settings/templates` | P3 | ☐ |
| Notification toggles | Demo | `settings/notifications` | P3 | ☐ |
| Sender address via Gmail | Demo | `settings/integrations` | P3 | ☐ |
| System inbound address | Demo | `settings/integrations` | P3 | ☐ |
| ⌘K candidate search | Demo / Live | header | P1 | ☐ |
| Notifications panel | Demo / Live | header | P1 | ☐ |
| Messages from candidates | Demo | header + timeline | P3 | ☐ |

## D. Candidate pages

| Reference feature | Source | mask0 | Phase | Status |
|-------------------|--------|-------|-------|--------|
| Entry URL in the job board's auto-reply | Demo / Live | pasted by the recruiter | P1 | ☐ |
| Entry: intro with job card, what to prepare | Demo / Live | `/a/[code]` step 1 | P1 | ☐ |
| Entry: contact, residence, desired salary, start date, job questions | Live | step 2 | P1 | ☐ |
| Entry: résumé (required) / CV (optional), phone photos resized in browser | Demo / Live | step 3 | P1 | ☐ |
| Entry: confirm, consent naming the AI vendor and retention, other-jobs opt-in | Live | step 4 | P1 | ☐ |
| Done screen with personal page URL and next steps | Demo / Live | done screen | P1 | ☐ |
| Closed job message | Live | `/a/[code]` | P1 | ☐ |
| Personal page: status, upload / replace documents | Live | `/p/[token]` | P1 | ☐ |
| ★ "Allow mail from our domain" note (carrier filters) | – | done screen + personal page | P1 | ☐ |
| Booking page (round, length, format) | Demo | `/p/[token]/book` | P2 | ☐ |
| Pick up to 3 slots | Demo | same | P2 | ☐ |
| Concerns with prepared answers | Demo | same | P2 | ☐ |
| Request received | Demo | same | P2 | ☐ |
| Reschedule / cancel | Demo | `/p/[token]/reschedule` | P2 | ☐ |
| ★ Withdraw | – | `/p/[token]/withdraw` | P2 | ☐ |
| Interview-day page (agenda, interviewer, join button) | Demo | `/p/[token]` | P2 | ☐ |
| Online interview with AI recorder | Demo | external meeting + bot | P4 | ☐ |
| Consent page (other companies' jobs, recording) | Demo | `/p/[token]/consent` | P3 | ☐ |
| AI interview | Live (stages) / LP (planned) | `/p/[token]/interview` | P5 | ☐ |

## E. Emails and paste texts

| Reference feature | Source | mask0 trigger | Phase | Status |
|-------------------|--------|---------------|-------|--------|
| Pass → booking invitation | Demo | `pass` | P2 | ☐ |
| Not booked → follow-up (3 days, max 2) | Demo | `follow_up` | P2 | ☐ |
| Interview confirmed (+ calendar invite) | Demo | `confirmed` + `.ics` | P2 | ☐ |
| Day-before reminder (+ reschedule link) | Demo | `remind_1d` | P2 | ☐ |
| Rejection after human confirmation (+ consent URL) | Demo | `fail` | P2 | ☐ |
| Result with next-round booking link | Demo | `next_round` | P2 | ☐ |
| 5- and 3-day nurture with concern answers | LP / Demo | `remind_5d`, `remind_3d` | P3 | ☐ |
| Interview day | Demo | `interview_day` | P3 | ☐ |
| Thanks after interview | Demo | `thanks` | P3 | ☐ |
| CV missing | Demo | `cv_missing` | P3 | ☐ |
| No-show re-booking | – ★ | `no_show` | P3 | ☐ |
| Custom trigger | Demo | `custom` | P3 | ☐ |
| AI interview invitation + reminder | Live (events) | `ai_invite`, `ai_remind` | P5 | ☐ |
| Send log with status | Demo / Live (events) | `messages` | P2 | ☐ |
| Test mode (dry run) | Live (events) | org `test_mode` | P2 | ☐ |
| Paste text: auto-reply | Demo / Live | `paste_templates.auto_reply` | P1 | ☐ |
| Paste text: nudge for not-yet-entered | Demo | `paste_templates.nudge` | P3 | ☐ |
| Paste text: booking re-invite | Demo | `paste_templates.reinvite` | P2 | ☐ |

## F. Platform

| Feature | Source | mask0 | Phase | Status |
|---------|--------|-------|-------|--------|
| Data separated per client | LP | RLS + client scoping | P0 / P3 | ☐ |
| Unique, unindexed candidate URLs | LP / Live | hashed tokens, `noindex`, `no-referrer` | P1 | ☐ |
| Retention purge | Live | `retention-purge` | P1 | ☐ |
| ★ Audit log | – | `audit_logs` | P1 | ☐ |
| ★ Data requests (disclosure / correction / deletion) | – | `settings/data` | P1 | ☐ |
| ★ PII encryption at rest | – | app-level AES-GCM | P1 | ☐ |
| ★ AI usage metering per org | – | `ai_usage` | P1 | ☐ |
| ★ Durable processing (no browser-driven jobs) | – | Inngest | P0 | ☐ |
| ★ Direct-to-storage uploads (10 MB PDFs) | – | signed upload URLs | P1 | ☐ |
| ★ Billing and plan limits | – | `settings/billing` | P3 | ☐ |
| ★ Virus scanning, penetration test | – | – | P3 | ☐ |
