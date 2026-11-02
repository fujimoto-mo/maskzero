# 01. Reference analysis: lista-hr.com

Verified on **2026-11-02** from the live HTML, JavaScript bundles and PDF of `lista-hr.com` and `app.lista-hr.com`. Nothing was submitted, no account was created, and the API was not called directly; endpoint shapes below come from the client code.

---

## 1. At a glance

| Item | Finding |
|------|---------|
| Product | **lista.**, an "AI recruiting platform" (採用AIプラットフォーム) |
| Operator | 合同会社lim force (lim force LLC) |
| What it automates | ① document screening (書類選考) ② interview scheduling (日程調整) ③ interviews (面接): an AI notetaker for human interviews (the LP calls it available now, but the live app's interview screen is still a placeholder) and an "AI interviewer" marked *in preparation* |
| Customers | Recruitment agencies / RPO firms that hire for many client companies (primary), and in-house HR teams |
| Not | **A job board.** There is no job search. Jobs stay on Indeed, engage and other boards; lista. takes over after someone applies there |
| Language | Japanese only |
| Selling | The landing page is sales-led (download the guide, book a consultation, try the demo). The live app also allows self-serve sign-up |
| Pricing | Not published ("depends on the number of clients and jobs") |

### The core loop

```
Job board (Indeed, engage, …)
  │ candidate applies → the board's auto-reply contains the lista. ENTRY URL for that job × board
  ▼
Entry page /a/{code}  (no login, ~3 min, phone-friendly)
  contact details + desired salary + start date + job-specific questions + résumé (required) / CV (optional)
  ▼
AI reads the documents → scores them against the job's criteria → pass / needs review / fail-pending
  ▼ pass                                  ▼ fail-pending → a person confirms before any rejection
Invitation to book an interview (personal page /p/{token})
  ▼
Candidate picks up to 3 slots + "concerns" → auto-confirm → confirmation, reminders (5/3/1 days before)
  ▼
Interview (human interview with an AI notetaker; AI interviewer later) → evaluation → offer → hired
```

### Three surfaces

| Surface | Host | What it is |
|---------|------|-----------|
| Landing page (LP) | `lista-hr.com/` | Static marketing page |
| Interactive demo | `lista-hr.com/demo/` | Mock-data app showing the **full product vision** (every screen) |
| Live product | `app.lista-hr.com` | The real app and API. **Only part of the vision is built so far** (§5.2) |

### What changed since the first crawl (2026-10-29)

The LP was redeployed on 2026-10-31 and the demo and app on 2026-11-01, so the earlier analysis was partly out of date:

- The LP header now has a **ログイン** (log in) link to `app.lista-hr.com/admin`. A real product exists; the earlier analysis only covered the mock demo.
- The live product uses **`/a/{code}`** for entry pages and **`/p/{token}`** for the candidate's personal page.
- The live pipeline is built around an **AI interview as the first interview** (stages "AI interview invited / taken / AI evaluation done"), which the demo does not show.
- The live app has **self-serve sign-up** (email + password, then "register your company", which seeds a sample job).
- The contact form now has two modes (download the guide / consult).
- The service guide PDF has **10 pages** and ends with a contact email and a demo URL.

---

## 2. URL inventory

| URL | Type | Notes |
|-----|------|-------|
| `lista-hr.com/` | LP | Anchors `#top #solution #change #flow #faq #contact` |
| `lista-hr.com/demo/` | Demo (SPA) | `noindex, nofollow`; one ~440 KB HTML file; starts on a gate screen |
| `lista-hr.com/lp/lista-service-guide.pdf` | Sales PDF | 10 pages, created 2026-10-18 |
| `lista-hr.com/api/contact` | JSON endpoint | LP contact form (`POST`; `GET` returns 405) |
| `app.lista-hr.com/admin` (also `/`, `/login`) | Live staff app | `noindex, nofollow`; client-rendered, hash routes (`#dash`, `#jobs`, …) |
| `app.lista-hr.com/a/{code}` | Candidate entry page | `noindex`, `referrer: no-referrer` |
| `app.lista-hr.com/p/{token}` | Candidate personal page | Same bundle as the entry page |
| `app.lista-hr.com/api/*` | JSON API | See §7 |
| `app.lista-hr.com/media/job-images/{id}` | Job images | Shown on the entry page |
| `robots.txt`, `sitemap.xml` | **404** on both hosts | |
| Privacy policy, terms, company page | **None** | The contact form asks for privacy consent without linking a policy. mask0 must publish these pages |

---

## 3. Landing page (`/`)

### 3.1 Sections

| # | Section | Content |
|---|---------|---------|
| 1 | Header | Logo + "AI recruiting platform" label. Nav: できること (#solution) · 導入後の変化 (#change) · よくある質問 (#faq) · **ログイン** (app) · 相談する (#contact). Changes style once the page scrolls |
| 2 | Hero (#top) | "For recruitment agencies" eyebrow; headline about handing hiring busywork to AI; 3 numbered points (screening / scheduling / interview, with an "AI interviewer in preparation" badge); CTAs download guide + consult; "try the demo, no registration" link; photo. Two animated widgets: an "AI handled this for you" activity log (3 entries) and a chat-bubble ticker cycling through 6 AI status messages |
| 3 | Pain points | 5 cards (reading every document, sending every email by hand, scheduling back-and-forth, drop-outs before the interview, headcount growing with each client), each with its consequence |
| 4 | Workload math | 100 applications ≈ **380 manual tasks** per job (100 document checks, 100 result emails, 90 scheduling messages, 60 confirmations/reminders, 30 interviews), ×10 for 10 clients; three consequences (cost scales with jobs, slow replies lose candidates, inconsistent records) |
| 5 | Solution (#solution) | The 3 steps, each split into "what you do" and "what AI does" |
| 6 | Video | ~30 s silent explainer; plays when half visible, pauses when scrolled away, off for reduced motion |
| 7 | Feature details 01–03 | Screenshot per step with a 4-chip flow (human decides → AI judges → AI contacts → human checks). Step 03 compares "human interviews with an AI notetaker (transcript, follow-up suggestions, report)" and "AI interviewer (in preparation)". States that a human makes the final decision |
| 8 | Before / after (#change) | Six manual tasks vs. what the system takes over; the human keeps "set criteria and availability, decide" |
| 9 | More features | Nurturing until interview day (messages 5/3/1 days before, answers to the candidate's concerns), per-client switching, funnel analytics |
| 10 | Who it's for | Agencies vs. in-house, 3 bullets and an outcome each |
| 11 | Candidate experience | 4 phone screens: entry (~3 min) → pass email → pick a slot → result email with the next booking link. No app, no sign-up |
| 12 | Getting started (#flow) | Start with 1 client × 1 job: consultation + demo → set criteria and availability together → run alongside the current process, then expand |
| 13 | Data protection | Data separated per client, admin-only access, per-candidate URLs not indexed, final decisions by people |
| 14 | FAQ (#faq) | 6 questions: automatic rejections?, how detailed can criteria be?, matching client interviewers' schedules, when the AI interviewer ships, supported job boards (Indeed, engage, …), pricing |
| 15 | Contact (#contact) | See §3.2 |
| 16 | Closing CTA + footer | CTAs, logo, operator link, ©. A floating mobile CTA bar appears after the hero and hides while the contact section is on screen |

### 3.2 Contact form

- **Mode toggle:** *Download the guide* (default) or *Consult*. In download mode the inquiry-type field is hidden and pre-set; after submission the form is replaced by a "guide ready" state with the PDF link. In consult mode the inquiry type is shown.
- **Fields:** company\*, name\*, email\* (format check), phone, inquiry type\* (download guide / considering adoption / want a demo walkthrough / pricing / other), message (≤ 3,000 chars), privacy consent\*, and a hidden honeypot field `website`.
- **Submit:** `POST /api/contact` with JSON `{company, name, email, phone, category, message, consent, website}`. Success returns `{ok: true}`; validation errors return `{fields: {…}}` shown per field; `429` shows a "too many submissions, try later" message. Promises a reply within 2 business days.

### 3.3 Implementation notes

Hand-written static HTML with inline CSS and JS; Google Fonts (DM Sans for numbers, Noto Sans JP 700/900); reveal-on-scroll animations with `IntersectionObserver`; `prefers-reduced-motion` respected; no framework, no analytics tags, no JSON-LD; `og:image` uses a relative path (should be absolute).

---

## 4. Interactive demo (`/demo/`): the full product vision

All data is mock data, and dates are shifted so "today" is always the visitor's current day.

### 4.1 Gate and shell

- **Gate:** two buttons, *log in to the admin screen* and *see the candidate's screens*.
- **Sidebar**, in hiring order: Dashboard · *(group "hiring steps")* Job postings, Screening, Interview candidates, Scheduling, Interviews · Candidates · Analytics · footer: Settings, Logout. On phones: a floating frosted bottom tab bar.
- **Header:** candidate search, notifications, messages, **client switcher** (4 sample client companies), user menu. Every screen shows a "sample data" badge; row details open in a right-hand drawer.

### 4.2 Staff screens

| Hash | Screen | Purpose | Key UI |
|------|--------|---------|--------|
| `dash` | ダッシュボード Dashboard | Daily starting point | Greeting; quick actions with counters (screening "to check", new job, entry URLs, scheduling, candidates); applicants per job board; funnel (applied 128 → passed 41 → interview set 33 → held 27 → offer 9 → hired 6) with average days between steps; 14-day applications with week-over-week; today's interviews |
| `jobs` | 求人原稿 Job postings | Write a posting once, paste it into each job board | Sectioned editor whose fields match Indeed and engage; posting-rule checks; per-board paste views; images; status draft / published / stopped |
| `docs` | 書類選考 Screening | Every application lands here | Filter tabs all / pass / check / fail; table with NEW badge, age, source, documents, score, verdict; criteria editor (basic conditions of kind *select / order / range* read from the form or the résumé, preferred criteria, weights, pass/fail lines); drawer with reasons per criterion, quotes and a document viewer; a "not yet entered" list of people the job board notified about but who haven't filled in the entry page, with a nudge text |
| `screen` | 面接予定者 Interview candidates | People who passed, "action needed" first | Booking-link state: sent and unopened / opened, not booked / booked; copy link, resend invitation; contact timeline |
| `sched` | 日程調整 Scheduling | Availability and occupancy | Month calendar; per-day hourly slots (start times 08:00–22:00) toggled open/closed; availability rules (common hours, per-weekday override, exclude weekends and public holidays, 42-day window); Google Calendar connection; interview tool (Meet / Zoom / Teams, or a fixed URL); AI recorder on/off with its display name; pending requests and an "auto-confirm" run |
| `iv` | 面接 Interviews | Before, during and after | Day list (1st / 2nd round). Tabs: **prep** (document highlights, purpose per round, AI question suggestions grouped as experience / consistency with documents / motivation, standard or deep mode) · **live assist** (transcript; suggestion types: deep-dive, inconsistency, skill check, jargon, attraction, care, missed topic; detected candidate needs) · **report** (evaluation, report, recording with clickable transcript, summary, comparison with other candidates). Decisions: pass / to 2nd round / fail, with undo |
| `pool` | 求職者リスト Candidates | Everyone across jobs | Stage filters; columns candidate, applied, job, stage, status, score; CSV download. Drawer: 8-stage progress, current status, **who it's waiting on** (candidate / staff / system), next automatic action, timeline with actor tags |
| `ana` | 分析 Analytics | Where people drop off | Period (this month / last month / last 3 months); detailed funnel from job-board notification to hire with the worst step highlighted and a hint; invite-to-open lag vs. interview rate; open-to-booking time; per job board (volume, pass rate, response days, interview rate); open rate by send hour; days per stage |
| `settings` | 設定 Settings | "Set once, then it runs" | Tabs: **entry URLs** (job × board, notified vs. entered counts, on/off); **templates** (automated emails §4.4, paste texts, custom automated email); **admin** (profile, members with roles 管理者 admin / 採用担当 recruiter / 面接官 interviewer / 閲覧のみ viewer, notification toggles, sender address via Gmail, a system inbound address that job-board notification emails and candidate replies are forwarded to, interview tool) |

### 4.3 Candidate walkthrough (16 scenes)

| Group | Scenes |
|-------|--------|
| Apply | Job-board auto-reply containing the entry URL · entry intro (job card, what to prepare) · contact details (name, phone, email, prefecture + city) · document upload (résumé required, CV optional, phone photos OK) · confirm + privacy consent · done (personal page link; next steps) |
| Screening | Pass email with the personal booking URL |
| Booking | Booking page (round, length, online) · pick **up to 3** preferred slots · "concerns" (pay, overtime and holidays, job content, commute, training, selection process, none), each showing the company's prepared answer · request received |
| Interview | Confirmation email (date, tool, URL, calendar invite) · day-before reminder (join URL + reschedule link) · interview-day page (agenda, interviewer, join button) · online interview with the AI recorder visible |
| Result | Result email, e.g. passed round 1, with a booking link for round 2 |

### 4.4 Automated emails and templates (demo)

| Trigger | When | Default timing | Default |
|---------|------|----------------|---------|
| `pass` | Passed screening | Immediately | On |
| `follow` | Booking page still not used | 3 days after sending, max 2 times | On |
| `fixed` | Interview time confirmed | Immediately | On |
| `remind` | Day before the interview | Day before 18:00 | On |
| `thanks` | Interview finished | Same day 18:00 | Off |
| `fail` | Rejection confirmed by a person | After confirmation | On |
| `doc` | CV not submitted | Day after applying 10:00 | Off |

- Custom emails choose a *when* (the 7 above plus "interview day") and a timing: immediately / same day 18:00 / day before 18:00 / next day 10:00 / 3 days later 10:00 / 1 week later 10:00.
- Merge fields: name, booking URL, interview date/time, interview tool, meeting URL, upload URL, consent URL (a rejected candidate can opt in to hear about other companies' jobs, which matters to agencies).
- Paste texts (sent through the job board's own messaging, not by the system): the auto-reply with `{URL}`, a nudge for applicants who haven't entered, and a booking re-invite.
- A send log shows recipient, template, time and state (opened / unopened / awaiting confirmation).

---

## 5. Live product (`app.lista-hr.com`)

### 5.1 Stack and sign-in

- A **Vite** multi-page build (`app.html` for staff, `entry.html` for candidates), plain JavaScript with hash routing, served by Vercel together with serverless functions under `/api/*`.
- **Supabase**: Auth (email + password), Realtime; the client sends the Supabase access token as `Authorization: Bearer` to the app's own API. `/api/config` hands the browser the Supabase URL and public anon key, plus a `devAuth` switch for local development.
- **Sign-in flow:** log in · sign up (password ≥ 8 chars, confirmation email) · "check your inbox" state · forgot password → reset link → set new password. After the first login, `/api/me` returns no company, so the user **registers a company name**, and the app creates the company with **one sample job** to learn from.
- **Claude** (Anthropic) reads the documents. Without a configured key the app shows "document reading is paused". The candidate consent text names "Anthropic's Claude".

### 5.2 Built vs. planned

The sidebar matches the demo, but four screens are placeholders that say which internal phase will build them.

| Area | Live? | Notes |
|------|-------|-------|
| Dashboard | ✅ partly | Interview widgets are empty until scheduling exists |
| Job postings | ✅ | Full editor, checks, images, paste views, AI fill |
| Entry URLs + auto-reply text | ✅ | In Settings |
| Candidate entry page + personal page | ✅ | §6 |
| Document screening | ✅ | Criteria, scoring, AI reading, overrides |
| Candidate list | ✅ | Manual add, CSV import/export, stage changes, timeline |
| Settings: company info, retention | ✅ | |
| Interview candidates, Scheduling, Google Calendar/Meet, interview tool | ❌ phase ③ | |
| Email templates, Gmail sender, notification settings, analytics, job-board notification counts | ❌ phase ④ | |
| Interviews (prep, notes, report) | ❌ phase ⑤ | The LP's FAQ says notetaking, follow-up suggestions and reports are usable now; the app shows a placeholder |
| Members and roles, 2-step verification, candidate messages | ❌ "in preparation" | One user per company today ("companies handled: 1") |

### 5.3 Dashboard

Time-of-day greeting; quick actions (screening with the number "to check", new job posting, entry URLs, scheduling, candidates); application cards per job board (top two plus "other", click to see jobs); this month's applications vs. last month; 12-month trend, this year vs. last; this month's interviews against a monthly goal (not set yet); today's interviews (empty for now); funnel table from `/api/admin/progress`; daily applications for 14 days, this week vs. last.

### 5.4 Job postings

- **List:** one card per job with title, location, pay, posting period, image count (x/6), a readiness line ("N things to fix before posting" or "ready to paste into each board"), entry-URL badges (count and entered applicants), and actions edit / paste to boards / check entry URLs.
- **Editor tabs:** *Input* · *Images* · *Paste into Indeed* · *Paste into engage* · *Paste into other boards* (choose the board, e.g. エン転職, doda, type).
- **Sections and fields** (★ required; *[Indeed]* / *[engage]* = only that board uses it):

| Section | Fields |
|---------|--------|
| Basic | job title★ · display title *[engage]* · job category★ · employment type★ (正社員 / 契約社員 / パート・アルバイト / 業務委託) · job class *[engage]* · posting period★ (end date optional) |
| Location | postcode★ · address★ · access · location notes (remote, travel, transfers, scope of change) · passive-smoking measure★ *[Indeed]* |
| Pay | pay type★ (月給 / 年俸 / 日給 / 時給) · range★ (万円) · fixed overtime pay · pay notes |
| Hours & holidays | working-time system · hours★ · average monthly hours *[Indeed]* · annual holidays · holidays★ |
| Job | description★ (engage: ≤ 750 chars) · scope of duty changes *[Indeed]* · appeal points *[Indeed]* |
| Requirements | experience required *[engage]* · education *[engage]* · must-have★ · nice-to-have |
| Benefits | insurance★ (4 checkboxes) · probation · benefits |
| Recruitment & company | headcount · hiring reason *[engage]* · business description *[engage]* (≤ 400 chars) |

- **Pre-posting checks** (red = likely to fail the board's review, yellow = fewer applications): required fields missing; length over a board's limit; end date before start date; the job title contains an employment type, company name, pay, "inexperienced welcome", urgency words or decorative symbols; requirements restrict by age, gender or nationality; full-time/contract jobs without all four insurances (yellow); no main image (red); an image under 800×600 (yellow); fewer than 3 images (yellow).
- **Images:** up to 6 slots (Indeed uses 5, engage 6); JPG or PNG; 1200×900 (4:3) recommended; minimum Indeed 800×600 / engage 600×450; ≤ 4 MB each; a caption per image (engage: ≤ 70 chars); slot 1 is the main image; a reminder to get consent from employees shown in photos.
- **Paste views:** every field in the exact order of that board's form, each with a copy button, "choose in the board's UI" markers for select fields, and board-specific tips (Indeed: screening questions and résumé settings live in Indeed; engage: a 7-item final check and ~3 days of review). Each view reminds the user to paste the entry URL into the board's auto-reply.
- **AI fill:** "fill empty fields with AI" drafts the display title, description and appeal points from what is already entered.
- **Save:** as draft, or "save as published"; stop posting; delete (click twice; deletes the job's applicants too).

### 5.5 Document screening

- **Layout:** pick a job; filter tabs; table with candidate, applied date, basic conditions summary, total score (basic % / specialist %), verdict, résumé, CV. Rows that already moved past screening show "moved to interview candidates". Passing candidates move on automatically.
- **Verdicts:** 書類合格 pass · 要確認 needs review · 不合格（確認待ち） fail, awaiting confirmation · 不合格 fail · manual pass / manual fail / manual review · "AI is reading". Badges also show "no documents", "AI could not read" and "AI verdict, not yet notified".
- **Criteria editor:**
  - *Basic conditions* have a kind: **choices** (unordered, e.g. night shifts, commute method; up to 8 options; mark which pass; optionally multi-select), **dropdown** (ordered; "up to X" or "X or above" passes, e.g. start date, education), **number range** (min/max + unit, e.g. commute minutes, years of experience). Each reads from the **entry-page answer** (it becomes a question on the entry page) or from the **résumé** (AI reads it). Any condition can be **required**: failing it means fail regardless of score. A "commonly used conditions" picker adds presets (in the demo: start date, driving licence, education, night shifts).
  - *Specialist conditions* are free-text (e.g. "B2B sales of IT products"); AI scores how well the documents match and shows the supporting passage.
  - **Weights:** the total is 100 points, split equally by default or set per condition; the split must add up to 100 before it is used.
  - **Lines:** below the fail line → fail; at or above the pass line → pass; in between → needs review. Information missing from the documents → needs review.
  - **Toggles:** *judge automatically* (off = everyone "needs review") and *a person confirms before a rejection is sent* (off = an AI fail becomes a rejection immediately).
  - Changing criteria re-scores everyone who hasn't passed yet; people already passed keep going.
- **Fairness guardrails:** a condition name containing a banned topic is **blocked**, citing MHLW's fair-screening guidance. The list covers domicile and birthplace, family and parents' jobs, housing and living environment, religion, politics, beliefs and role models, unions and social movements, gender, marriage, pregnancy and children, nationality, race and ethnicity, appearance, height, weight and photos, health, illness and disability, blood type and star sign. Age-related conditions raise a warning and **cannot be saved without one of the legal exception reasons** (労働施策総合推進法施行規則 1条の3: 1号, 2号, 3号イ–ニ).
- **AI safety rules:**
  - If a document contains text that looks like **instructions to the AI**, no automatic verdict is given; the candidate goes to "needs review".
  - If a supporting passage the AI cites **cannot be found in the document**, the candidate goes to "needs review". The drawer states that the quoted passages are verbatim.
  - The drawer states the model and time, and that "the AI verdict is a proposal; staff decide".
- **Drawer:** score ring with the pass line; each basic condition (value, required, met or not) and specialist condition (match, quote, or "not mentioned"); the candidate's entry answers (residence, desired salary, start date, consents); documents with open / upload on the candidate's behalf (≤ 4 MB) / "re-read with AI"; actions pass / fail / back to the AI verdict; a document viewer listing the quotes the AI used.

### 5.6 Candidate list

- Filters all / in screening / interviewing / passed / rejected or withdrawn; columns candidate, applied, job, stage, status, AI score; CSV download; ⌘K search in the header.
- **Add an applicant** by hand (name, email, phone, job board) or **import a CSV** exported from a job board: Shift_JIS or UTF-8; name, email, phone, source and memo columns are detected from the header (kana columns ignored, split surname/given-name columns joined); the job board can be set for all rows; preview of the first 5 rows; rows without a name are skipped; the same email in the same job counts as a duplicate; the result reports registered / duplicates / failed rows with row numbers.
- **Drawer:** AI score and band, the pipeline steps, current status, **next action** (e.g. "waiting for the candidate to take the AI interview", "decide whether to move to 2nd interview", "waiting for the offer reply"), a timeline with the actor (candidate / automatic / staff), contact details, delete (click twice; also deletes AI interview records).
- **Timeline events:** created (by entry / CSV / manual / test interview), stage change (from → to, automatic or staff), email (invitation or reminder; sent / dry run / failed with the error), AI interview started / completed / aborted, AI scored (total and band).

### 5.7 Settings

- **Entry URLs:** one URL per job × job board, chosen from 22 boards in 4 groups or "other (type a name)": 総合型 Indeed, 求人ボックス, スタンバイ, engage · 転職サイト doda, マイナビ転職, リクナビNEXT, エン転職, type, ビズリーチ, Green, Wantedly, ミドルの転職 · アルバイト バイトル, タウンワーク, マイナビバイト, イーアイデム, はたらいく, ジモティー · その他 ハローワーク, own website, referral. Copy the URL, preview the candidate page, see counts (entered; "notified by the board" arrives with phase ④), and switch intake on/off. A URL only accepts entries while its job is published.
- **Auto-reply text:** one template for all boards with a `{URL}` placeholder (saving fails without it); the finished text with the right URL can be copied per job × board.
- **Document retention:** days until documents of rejected or withdrawn candidates are deleted automatically, **30–730**. The number appears in the candidate consent text.
- **Company:** name, sender display name, reply-to address. Placeholders for notifications, 2-step verification, members and roles, interview tool, Gmail sender.

### 5.8 Header

Candidate search (⌘K), notifications ("new application", mark all as read), messages ("receiving candidate messages is in preparation"), company name, user menu.

---

## 6. Candidate pages (live)

### 6.1 Entry page `/a/{code}`

Loaded from `GET /api/entry/{code}`: company, job board name, open/closed, job (title, display title, main image), questions, salary bands, start-date options, file-size limit, retention days.

| Step | Content |
|------|---------|
| 1 · Intro | "Thanks for applying via {board}", the job card, what to prepare (résumé; CV optional; phone photos OK). A closed job shows "intake has ended" |
| 2 · Contact | Name\*, phone\*, email\*, residence\* (prefecture from all 47 + city), desired salary and start date (option lists come from the server; the demo uses salary bands from "under ¥3M" to "¥7M+" plus "no preference", and start dates "immediately / within 1 month / within 3 months / later"), plus the job's questions generated from form-sourced criteria (number input, single select or multi-select). Note: "work history is read from your résumé". Hidden honeypot field |
| 3 · Documents | Résumé\* and CV (optional) as PDF (size-limited) or photos. **Photos are resized in the browser** (long side ≤ 2,576 px, JPEG 85 %) before upload. Notes: the CV can be sent later from the personal page; gender, family or domicile don't affect screening even if missing |
| 4 · Confirm | Summary; a privacy notice stating the purpose, that **Claude (Anthropic) reads the documents** to compare them with the company's criteria, that staff make the decision, that documents are deleted N days after a rejection, that sensitive items need not be written, and how to request disclosure or deletion. Consent\* plus an optional opt-in to hear about **other companies' jobs** |
| Done | "Application received", the **personal page URL** (`/p/{token}`, "bookmark it"), next steps: screening → interview invitation → interview |

Submission: `POST /api/entry/{code}` with the answers and `elapsed_ms` (time spent, a bot signal) returns a token; each document is then sent with `PUT /api/portal/{token}/docs/{resume|cv}` (raw body, file name in a header); finally `POST /api/portal/{token}/submit` (fire-and-forget) starts processing.

### 6.2 Personal page `/p/{token}`

From `GET /api/portal/{token}`: greeting with the candidate's name, the job, the current status text, and the submitted documents with upload/replace while uploads are allowed. Booking, rescheduling and withdrawal are not built yet (demo only).

---

## 7. API surface (observed in client code; methods partly inferred)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/config` | Supabase URL, anon key, dev-auth switch |
| `GET /api/me` · `POST /api/orgs` | Current user + company; create the company (seeds a sample job) |
| `GET/PATCH /api/admin/org` | Company settings: name, sender name, reply-to, auto-reply template, retention days |
| `GET/POST /api/admin/jobs` · `PUT/DELETE /api/admin/jobs/{id}` | Jobs (`job_title`, `posting_fields` JSON, `require_interview`, `status`) |
| `POST /api/admin/jobs/{id}/fill` | AI fills empty posting fields |
| `/api/admin/jobs/{id}/images/{slot}` | Upload, caption, remove images |
| `GET/PUT /api/admin/jobs/{id}/rules` | Screening criteria + presets + age exception list |
| `GET/POST /api/admin/entry-urls` · `PATCH /api/admin/entry-urls/{id}` | Entry URLs, on/off |
| `GET /api/admin/screening?job=` · `POST /api/admin/screening/run` | Screening list; process pending items |
| `GET/POST /api/admin/candidates` · `PATCH/DELETE /api/admin/candidates/{id}` | Candidates |
| `POST /api/admin/candidates/import` | CSV import |
| `/api/admin/candidates/{id}/screening` · `/judge` · `/rescreen` · `/docs/{kind}` | Screening detail, manual verdict, re-read, documents |
| `GET /api/admin/progress` | Funnel `[{stage, label, reached, rate}]` |
| `GET/POST /api/entry/{code}` | Entry page data; submit an application |
| `GET /api/portal/{token}` · `PUT …/docs/{kind}` · `POST …/submit` | Personal page; upload; start processing |

---

## 8. Status vocabulary

| Concept | Demo | Live product |
|---------|------|--------------|
| Pipeline | 応募 applied · 書類の判定 screening · 面接予約 booking · 日程確定 scheduled · 面接 interview · 評価 evaluation · 内定 offer · 入社 hired | applied · doc_passed · invited (AI interview invited) · interviewed (AI interview taken) · evaluated (AI evaluation done) · second (2nd interview) · offered · hired + rejected · withdrawn |
| Screening verdict | pass · check · failcheck · fail · manualpass · manualcheck · manualfail | same + pending ("AI is reading") |
| Booking link | sent (unopened) · opened (not booked) · booked | not built |
| Waiting on | candidate · staff · system | shown as a "next action" sentence per stage |
| Event actor | candidate · automatic · staff | same |

---

## 9. Product principles worth adopting

1. **No job-board API dependency.** A per-board entry URL in the board's auto-reply works with any board on day one; CSV import and staff upload cover the rest.
2. **Candidates never create accounts.** Unguessable per-application URLs, no app, about 3 minutes on a phone.
3. **AI proposes, people decide rejections.** A fail is only pending until a person confirms it (configurable, on by default).
4. **Explainable verdicts.** Every criterion shows its result and a verbatim quote from the document.
5. **Defensive AI.** Instructions hidden in a document, or a quote the AI can't back up, send the case to a person instead of producing a verdict.
6. **Fairness built into the editor.** Banned topics are blocked; age needs a legal exception reason.
7. **Transparent to candidates.** The consent text names the AI vendor, the human decision and the retention period.
8. **Multi-client by design** for agencies (client switcher, data separated per client).
9. **"Waiting on whom" and "next action"** for every candidate.
10. **Write once, post everywhere.** One posting, per-board paste views and posting-rule checks.

---

## 10. Weak spots mask0 can improve on

| Reference | Better for mask0 |
|-----------|------------------|
| AI processing appears to be started from the browser (the entry page fires a "submit" call; the screening screen calls `screening/run` while rows are pending) | A durable job queue, so processing never depends on an open tab |
| Uploads go through API functions (Vercel caps function request bodies at about 4.5 MB, which likely explains the 4 MB limits and browser resizing) | Direct-to-storage signed uploads (10 MB PDFs), then server-side verification |
| Counting job-board notifications is planned via a Gmail connection; reading mail needs Google's restricted Gmail scopes, which require a third-party security assessment | A forwarding inbound address per company; no mailbox access needed |
| No privacy policy, terms or company page | Publish them from day one (APPI requires a stated purpose of use) |
| No robots.txt, sitemap, JSON-LD; relative `og:image` | Generated SEO metadata |
| One user per company; no roles, no 2-step verification yet | Invites, roles, client scoping and MFA early |
| Demo is a hand-built mock that can drift from the product | Demo = the real app on a seeded sandbox company |
| Holidays hard-coded for 2026–2027 in the demo | A maintained holiday library |

---

## 11. Originality rules for mask0

Copying the **functionality** and **information architecture** is fine. Copying the **expression** is not. Do not reuse lista.'s:

- text: headings, body copy, FAQ answers, email and auto-reply wording, consent text, sales PDF;
- images, screenshots, video, logo, icons or exact color palette;
- JavaScript, CSS or HTML source.

Write all copy from scratch, design a mask0 identity, and take your own screenshots once the product exists. Get legal advice before launch if mask0 will compete in the same market.
