# 03. Sitemap and routes: mask0

One Next.js app serves three surfaces in separate route groups, each with its own layout, auth and caching rules:

| Surface | Route group | Auth | Indexing |
|---------|-------------|------|----------|
| Marketing | `app/(marketing)` | none | indexed |
| Staff app | `app/(auth)`, `app/(app)` | Supabase session | `noindex` |
| Candidate pages | `app/(candidate)` | unguessable token in the URL | `noindex`, `Referrer-Policy: no-referrer` |

```
mask0.example/              marketing
mask0.example/app/…         staff app
mask0.example/a/{code}      candidate entry page   (pasted into job-board auto-replies)
mask0.example/p/{token}     candidate personal page
```

`mask0.example` is a placeholder. Short candidate paths keep links readable in job-board messages and SMS. The reference splits the LP (`lista-hr.com`) and the app (`app.lista-hr.com`); mask0 can do the same later by pointing an `app.` domain at the same project, without changing any route.

---

## 1. Marketing: `app/(marketing)`

| Route | Page | Phase |
|-------|------|-------|
| `/` | Landing page (sections in [01 §3.1](01-reference-site-analysis.md#31-sections)), contact form at `#contact` | P1 |
| `/demo` | Explains the demo; buttons create the visitor's sandbox and open it (admin view) or its real entry page (candidate view) | P1 |
| `/privacy` | Privacy policy (個人情報の取扱い), including the AI vendor and cross-border transfer | P1 |
| `/terms` | Terms of service | P1 |
| `/security` | How data is protected | P1 |
| `/company` | Operator information | P1 |
| `/guide.pdf` | Service guide (own content) | P1 |
| `/sitemap.xml`, `/robots.txt`, `/opengraph-image` | Next.js metadata routes | P1 |
| `/en/…` | English pages (next-intl; Japanese is the default without a prefix) | later |

---

## 2. Staff app

### 2.1 Sign-in and onboarding: `app/(auth)`

| Route | Page |
|-------|------|
| `/login` | Email + password, "Sign in with Google", link to sign-up and password reset |
| `/signup` | Email + password (≥ 8 chars) |
| `/signup/check-email` | "Open the link we sent to confirm your address" |
| `/forgot-password`, `/reset-password` | Reset request; set a new password from the emailed link |
| `/auth/callback` | OAuth / email-link callback |
| `/auth/sign-out` | `POST` from a plain form; signs out and does a full page load so no signed-in screen stays in memory |
| `/onboarding` | First login without a company: enter the company name → creates the org, default client and a sample job |
| `/invite/[token]` | Accept an invitation |
| `/app` | Redirects to the last used `/app/[org]/[client]/dashboard` |

### 2.2 Client pages: `/app/[org]/[client]/…`

| Route | Screen | Reference (`#hash`) | Phase |
|-------|--------|---------------------|-------|
| `dashboard` | ダッシュボード | `dash` | P1 |
| `jobs` | 求人原稿 list | `jobs` | P1 |
| `jobs/new`, `jobs/[jobId]?tab=edit\|images\|indeed\|engage\|other` | Job editor and paste views | `jobs` | P1 |
| `screening?job=&f=pass\|check\|fail&a={applicationId}` | 書類選考 list + drawer | `docs` | P1 |
| `screening/criteria?job=` | Basic and specialist conditions, weights, lines, toggles | `docs` (rules panel) | P1 |
| `screening/waiting` | "Not yet entered" list | `docs` (waits) | P3 |
| `candidates?f=&a={applicationId}` | 求職者リスト + drawer | `pool` | P1 |
| `candidates/import` | CSV import wizard | `pool` (CSV) | P1 |
| `interview-candidates?a=` | 面接予定者 | `screen` | P2 |
| `schedule?m=2026-11` | 日程調整 month calendar | `sched` | P2 |
| `schedule/availability` | Availability rules | `sched` (settings) | P2 |
| `interviews?d=2026-11-04` | 面接 day list | `iv` | P4 |
| `interviews/[interviewId]?tab=prep\|live\|report` | Interview workspace | `iv` tabs | P4 |
| `analytics?period=m\|p\|q` | 分析 | `ana` | P3 |
| `settings/entry-urls` | 応募受付URL + auto-reply text | `settings` → URL | P1 |
| `settings/templates` | Automated emails and paste texts | `settings` → templates | P2 / P3 |
| `settings/scheduling` | Interview tool, recorder, calendar connection | `settings` → admin | P2 |

### 2.3 Org pages: `/app/[org]/…`

| Route | Screen | Who | Phase |
|-------|--------|-----|-------|
| `settings/company` | Company name, sender display name, reply-to, retention days | admin | P1 |
| `settings/members` | Members, invitations; roles and client scope from P3 | admin | P1 / P3 |
| `settings/profile` | Own profile, MFA, sessions | everyone | P1 |
| `settings/notifications` | Own notification preferences | everyone | P3 |
| `settings/integrations` | Gmail sender, Google / Zoom / Microsoft, inbound address | admin | P2 / P3 |
| `settings/data` | Retention, data requests, audit log, exports | admin | P1 |
| `settings/billing` | Plan, usage, invoices | admin | P3 |
| `clients` | Client companies (agencies) | admin | P3 |

**URL rules.** Drawers, tabs and filters live in query parameters, so links can be shared and the back button works. Never put personal data in a URL. Record IDs are UUIDv7 (time-ordered).

---

## 3. Candidate pages: `app/(candidate)`

| Route | Page | Phase |
|-------|------|-------|
| `/a/[code]` | Entry page: one route with 4 client-side steps (intro → contact → documents → confirm) and a done screen; closed jobs show "intake has ended" | P1 |
| `/p/[token]` | Personal page: status in plain words, documents (upload / replace) | P1 |
| `/p/[token]/book` | Pick up to 3 slots → concerns → request received | P2 |
| `/p/[token]/reschedule` | Change or cancel the interview | P2 |
| `/p/[token]/withdraw` | Withdraw the application | P2 |
| `/p/[token]/consent` | Opt in to other companies' jobs / recording | P3 |
| `/p/[token]/interview` | AI interview | P5 |

One token per application (128-bit, stored hashed). Invitations for each interview round are records, not separate links: `/p/{token}/book` always shows the round that is currently open.

---

## 4. API and webhooks: `app/api`

Staff-side mutations use **Server Actions**. Route handlers are only for public endpoints, file flows, webhooks and anything third parties call.

| Route | Method | Purpose | Protection |
|-------|--------|---------|------------|
| `/api/contact` | POST | Marketing contact form | Turnstile, honeypot, rate limit |
| `/api/entry/[code]` | POST | Create the application; returns the personal token and signed upload URLs | Turnstile, honeypot, time check, rate limit |
| `/api/demo` | POST | Create (or reopen) the visitor's `/demo` sandbox, sign them in as its user, return the URL to open | Turnstile, rate limit, cap on live sandboxes |
| `/api/p/[token]/uploads` | POST | Signed upload URL for a résumé / CV | Token, rate limit |
| `/api/p/[token]/submit` | POST | Mark uploads complete → emits `application.submitted` | Token |
| `/api/p/[token]/booking` | POST | Submit preferred slots and concerns | Token (P2) |
| `/api/files/[documentId]` | GET | Permission check → redirect to a short-lived signed URL; audited | Staff session |
| `/api/export/candidates.csv` | GET | CSV export (UTF-8 BOM) | Staff, recruiter+; audited |
| `/api/inngest` | GET/POST/PUT | Background job endpoint | Inngest signing key |
| `/api/webhooks/resend` | POST | Delivery, bounce, complaint | Signature |
| `/api/webhooks/inbound-email` | POST | Job-board notifications, candidate replies | Provider signature (P3) |
| `/api/webhooks/meeting-bot` | POST | Recording / transcript ready | Provider signature (P4) |
| `/api/oauth/{google,zoom,microsoft}/callback` | GET | Calendar, meeting and Gmail connections | OAuth state + PKCE (P2 / P3) |

---

## 5. Navigation (staff app)

```
Sidebar (desktop) / bottom tab bar (mobile)
├─ Dashboard
├─ ── Hiring steps ──
│  ├─ Job postings                         P1
│  ├─ Screening        [badge: to review]  P1
│  ├─ To interview     [badge: action]     P2
│  ├─ Scheduling       [badge: requests]   P2
│  └─ Interviews       [badge: today]      P4
├─ Candidates                              P1
├─ Analytics                               P3
└─ (bottom) Settings · Log out
Header: ⌘K candidate search · notifications · messages (P3) · client switcher (P3) · user menu
```

Screens of later phases are hidden until they ship, rather than shown as "coming soon" placeholders like the reference does.
