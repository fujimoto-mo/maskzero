# 02. Feature specification: mask0

Phases (see [06-roadmap.md](06-roadmap.md)): **P1** intake & screening · **P2** booking & scheduling · **P3** automation, analytics & team · **P4** interviews · **P5** AI interviewer. P1–P3 match the reference's own phases ①–④, so each phase ends with a product people can use.

Reference details for every screen are in [01-reference-site-analysis.md](01-reference-site-analysis.md). Terms follow [01 §8](01-reference-site-analysis.md#8-status-vocabulary).

## Personas

| Persona | Who | Main jobs |
|---------|-----|-----------|
| **Owner / admin** (管理者) | Runs the agency or HR team account | Company settings, members, clients, billing, data requests |
| **Recruiter** (採用担当) | Agency or in-house HR staff | Jobs, criteria, screening, invitations, scheduling |
| **Interviewer** (面接官) | Line manager or client staff | Own interviews: prep, notes, decision |
| **Viewer** (閲覧のみ) | Client stakeholder | Read-only dashboards and candidates |
| **Candidate** (求職者) | Applied on a job board | Enter details and documents, book, attend, see results. **No account** |
| **Visitor** | Prospect on the marketing site | Learn, try the demo, contact sales |

---

## M0 · Marketing site (P1)

| ID | Requirement |
|----|-------------|
| M0-1 | Landing page with the section structure in [01 §3.1](01-reference-site-analysis.md#31-sections), in original mask0 copy and visuals |
| M0-2 | Contact form with two modes (download the guide / consult). Fields: company\*, name\*, email\*, phone, inquiry type\*, message (≤ 3,000), privacy consent\* with a link to `/privacy`. Zod validation on both sides, honeypot + Cloudflare Turnstile + rate limit (429), stored in `contact_inquiries`, notification email to sales, auto-reply to the sender. Download mode reveals the guide link after submit |
| M0-3 | `/privacy`, `/terms`, `/security`, `/company` pages |
| M0-4 | `/demo`: the **real app** on a seeded sandbox company, reset nightly. An admin view and a candidate view (the sandbox's real entry page and personal page) |
| M0-5 | SEO: metadata, absolute OG image, `sitemap.xml`, `robots.txt`, JSON-LD (`Organization`, `SoftwareApplication`, `FAQPage`) |
| M0-6 | Floating CTA bar on phones; animations respect `prefers-reduced-motion` |

**Done when** Lighthouse (mobile) scores ≥ 90 in all four categories, a submission lands in the database and the sales inbox, and every section works at 360 px.

---

## M1 · Accounts, companies, clients, roles (P1 → P3)

| ID | Requirement | Phase |
|----|-------------|-------|
| M1-1 | **Organization** = paying tenant (agency or in-house company). **Client** = a company the org hires for. Every org gets a default client; in-house orgs never see the client concept | P1 (schema), P3 (switcher UI) |
| M1-2 | Self-serve sign-up: email + password (≥ 8 chars, email confirmation) or Google; password reset. First login asks for the company name, then creates the org, default client and **one sample job** | P1 |
| M1-3 | Invite members by email (owner + member) | P1 |
| M1-4 | Roles `admin`, `recruiter`, `interviewer`, `viewer`, optionally limited to specific clients | P3 |
| M1-5 | Client switcher in the header; the URL carries the client (`/app/[org]/[client]/…`) | P3 |
| M1-6 | Profile, last login, sign out of all devices; TOTP MFA (optional in P1, required for admins in P3) | P1 / P3 |
| M1-7 | Every permission is checked on the server **and** backed by Postgres RLS ([05 §5](05-architecture.md#5-multi-tenancy-and-data-access)) | P1 |

| Action | admin | recruiter | interviewer | viewer |
|--------|:-----:|:---------:|:-----------:|:------:|
| Members, clients, company settings, data requests | ✅ | – | – | – |
| Jobs, criteria, templates, entry URLs | ✅ | ✅ | – | – |
| Change verdicts, confirm rejections | ✅ | ✅ | – | – |
| See candidates of the client | ✅ | ✅ | own interviews | ✅ read |
| Interview prep, notes, decision | ✅ | ✅ | own | – |
| CSV export, document download | ✅ | ✅ | – | – |

---

## M2 · Job postings (求人原稿) (P1)

| ID | Requirement |
|----|-------------|
| M2-1 | Job list as cards: title, location, pay, posting period, image count, readiness ("N things to fix" / "ready"), entry-URL badges with entered counts; actions edit / paste / entry URLs; duplicate a job |
| M2-2 | Sectioned editor with the field set in [01 §5.4](01-reference-site-analysis.md#54-job-postings) (a superset of Indeed and engage). Stored as `posting_fields` JSON validated by **one Zod schema** shared by form, API and database. Each field is tagged with the boards that use it; counters for board length limits |
| M2-3 | Pre-posting checks, red (blocks "ready") or yellow (advice): required fields; length limits; period order; job-title rules (no employment type, company name, pay, "inexperienced welcome", urgency words, decorative symbols); no age/gender/nationality limits in requirements; insurance for full-time/contract; main image present, size and count. Add Japanese labor-law checks the reference lacks: **scope of changes to work location and duties** (required in job ads since April 2024), passive-smoking measure, fixed-overtime details (hours, amount, extra pay above them), a minimum-wage hint |
| M2-4 | Images: 6 slots, JPG/PNG, ≥ 800×600 (1200×900 recommended), ≤ 4 MB, caption ≤ 70 chars, slot 1 = main image, consent reminder for staff photos |
| M2-5 | Paste views for Indeed, engage, and a generic order for other boards: fields in the board's form order, copy per field and "copy all", select-field markers, board tips, reminder to paste the entry URL into the auto-reply |
| M2-6 | AI fill: drafts the display title, description and appeal points from the filled fields; never overwrites a filled field; the user reviews before saving |
| M2-7 | Status draft / published / stopped. Delete only while the job has no applicants; otherwise archive (the reference deletes applicants along with the job) |

**Done when** a posting written once can be pasted field by field into Indeed and engage with zero red checks, and every check has a unit test.

---

## M3 · Intake: entry URLs, entry page, personal page, imports (P1, inbound mail P3)

| ID | Requirement | Phase |
|----|-------------|-------|
| M3-1 | **Entry URL** per job × board (`https://{app}/a/{code}`, 6–8 char code): the 22 boards in [01 §5.7](01-reference-site-analysis.md#57-settings) plus a custom name. Copy, preview, on/off, entered count; accepts entries only while the job is published | P1 |
| M3-2 | **Auto-reply text** with a required `{URL}` placeholder; copy-ready per job × board. Org default, per-client override | P1 / P3 |
| M3-3 | **Entry page** in 4 steps ([01 §6.1](01-reference-site-analysis.md#61-entry-page-acode)): intro → contact (name, phone, email, prefecture + city, desired salary band, start date, questions generated from form-sourced criteria) → documents → confirm + consent. Input survives a reload (sessionStorage). Honeypot, time-on-page check, Turnstile, rate limit per IP and per code | P1 |
| M3-4 | **Documents:** résumé required, CV optional. PDF ≤ 10 MB; photos (JPEG/PNG/HEIC) converted in the browser to JPEG with the long side ≤ 2,576 px. Upload **directly to storage** with a signed URL; the server then checks magic bytes, size and page count before marking the file ready. Virus scan in P3 | P1 |
| M3-5 | **Consent text** built from settings: company name, purpose of use, that AI (Claude, provided by Anthropic, a US company) reads the documents, that people decide, the retention days, how to request disclosure or deletion. Optional opt-in to hear about other companies' jobs (agencies). Each consent stored with its text version | P1 |
| M3-6 | **On submit:** the same email inside the org is the same candidate; the same candidate + same job is the same application (new files are attached, no duplicate). Create answers, documents and consents; issue the personal-page token; emit `application.submitted` | P1 |
| M3-7 | **Done screen:** personal page URL, next steps, and a note to allow mail from mask0's sending domain (Japanese carrier mail filters often block it) | P1 |
| M3-8 | **Personal page** `/p/{token}`: current status in plain words, upload or replace documents while allowed. Later: book / reschedule / withdraw and the interview details with a join button (P2), consent page (P3), AI interview (P5) | P1 → P5 |
| M3-9 | **Staff intake:** add an applicant by hand; import a job-board CSV (Shift_JIS or UTF-8, header detection, preview of 5 rows, dedupe by email per job, report of registered / duplicate / failed rows); upload documents on a candidate's behalf | P1 |
| M3-10 | **Inbound address** per org (`in+{org}@inbound.{domain}`): job-board notification emails forwarded there are parsed per board into "waiting" records (applied on the board, not entered yet) and matched when the person enters. Candidate replies are attached to the timeline | P3 |
| M3-11 | **"Not yet entered" list** with a copyable nudge text for the board's messaging | P3 |

**Done when** an applicant on a phone finishes in ≤ 3 minutes with a photographed résumé, the application appears in screening within seconds, and a repeated entry never creates a second application.

---

## M4 · Document reading and AI screening (書類選考) (P1)

| ID | Requirement |
|----|-------------|
| M4-1 | **Read documents:** the AI returns a verbatim transcript, a structured profile (education, work history, licences, skills, desired pay, address, birth year, motivation) and a legibility rating. For PDFs with a text layer, the locally extracted text is the transcript of record. Model and prompt version are stored |
| M4-2 | **Basic conditions** of kind *choices* (≤ 8 options, mark which pass, optional multi-select), *dropdown* (ordered; "up to X" / "X or above"), *number range* (min/max + unit). Source: entry-page answer or résumé. Any condition can be **required**. Presets: start date, driving licence, education, night shifts, commute time |
| M4-3 | **Specialist conditions** in free text; the AI returns `yes / partial / no / not_stated` with a **verbatim quote** |
| M4-4 | **Scoring:** 100 points split equally or per condition (must add to 100 before use). A met condition earns its points, `partial` earns half. Verdict: a failed required condition → `fail_pending`; required information not in the documents → `check`; score ≥ pass line → `pass`; score < fail line → `fail_pending`; otherwise `check`. Computed in code, never by the AI |
| M4-5 | **Safety overrides → `check`** (with the reason shown): instructions to the AI found in a document; any quote not found in the transcript; low legibility; AI refusal or invalid output; reading failed |
| M4-6 | **Toggles:** judge automatically (off = everyone `check`); a person confirms before a rejection (default on; turning it off shows a warning and is audited) |
| M4-7 | **Human decisions:** pass / fail / needs review / back to the AI verdict, with a note; bulk-confirm rejections; full history; manual decisions are never overwritten by re-screening |
| M4-8 | **Re-screening** after a criteria change: every application of the job that hasn't passed and has no manual decision, in the background with progress, re-using stored transcripts (no re-reading) |
| M4-9 | **Screen:** job picker, filter tabs, table, drawer and viewer as in [01 §5.5](01-reference-site-analysis.md#55-document-screening); quotes highlighted in the document text |
| M4-10 | **Fairness guardrails:** condition names and options are checked against the banned-topic list (MHLW fair screening); age conditions need a legal exception reason and show a warning; prompts tell the model to ignore protected attributes and photos; the candidate sees that such items don't affect screening |
| M4-11 | Passing moves the application to "interview candidates"; from P2 it also sends the invitation |
| M4-12 | "Re-read with AI" per candidate; a staff upload starts reading automatically |

**Done when** a 2-page PDF résumé and a phone photo of one each produce a transcript, verdict and reasons within 60 s at p95; every prompt-injection test file lands in `check`; no one is rejected without a human confirmation while the toggle is on; the eval targets in [06](06-roadmap.md) are met.

---

## M5 · Candidates (求職者リスト) (P1)

| ID | Requirement |
|----|-------------|
| M5-1 | All applications of the client: filters (stage group, job, board, date), search, columns candidate / applied / job / stage / status / score, keyset pagination |
| M5-2 | Drawer: pipeline steps, current status, **waiting on** (candidate / staff / system), **next action** and the next automatic action with its time, timeline with actor tags, contact details, documents |
| M5-3 | Manual stage changes with a reason: next round (issues a new invitation from P2), offer, hired, withdrawn, rejected. This covers decisions until the interview workspace arrives in P4 |
| M5-4 | CSV export, UTF-8 with BOM so Excel shows Japanese correctly; role-gated and audited |
| M5-5 | Delete a candidate (admin, confirmation, audited); documents and AI records go with it |
| M5-6 | Talent pool: candidates who opted in can be suggested for other clients' jobs, and can unsubscribe with one click (P3) |

---

## M6 · Dashboard and notifications (P1 basic, P2–P3 full)

| ID | Requirement | Phase |
|----|-------------|-------|
| M6-1 | Greeting; quick actions with counters (to review, rejections to confirm; booking requests from P2) | P1 |
| M6-2 | Applications per board this month, month-over-month, 12-month trend vs. last year, funnel with conversion and average days per step, 14-day chart vs. last week | P1 |
| M6-3 | Today's interviews; this month's interviews vs. a monthly goal | P2 / P3 |
| M6-4 | In-app notifications: new application, needs review (P1); interview confirmed, interview tomorrow (P2); candidate replied (P3). Per-user email preferences (P3) | P1 → P3 |
| M6-5 | Global candidate search (⌘K) | P1 |

---

## M7 · Interview invitations (面接予定者) (P2)

| ID | Requirement |
|----|-------------|
| M7-1 | On pass: an invitation for round N (`sent → opened → booked`, with timestamps) and the pass email linking `/p/{token}/book` |
| M7-2 | List with "action needed" first (unopened > 2 days, opened but not booked, booked); copy link, resend (email, or text for the board's messaging), mark withdrawn |
| M7-3 | Drawer timeline: passed → link issued → email sent → page opened → slots submitted → confirmed → reminder sent |
| M7-4 | Automatic follow-up when not booked: 3 days later, at most twice (configurable) |

---

## M8 · Availability and scheduling (日程調整) (P2)

| ID | Requirement |
|----|-------------|
| M8-1 | Availability per client (optionally per interviewer): common hours, per-weekday override, slot length (default 60 min), buffer, exclude weekends, exclude Japanese public holidays, booking window (default 42 days), minimum notice |
| M8-2 | Month calendar with per-day slot toggles (overrides) and occupancy |
| M8-3 | Booking page: up to **3** preferred slots among free ones, "concerns" with the company's prepared answers, memo |
| M8-4 | Confirmation mode: **automatic** (the first preference still free is confirmed atomically) or manual. No match → request stays pending and staff are notified |
| M8-5 | Candidate can reschedule or cancel up to N hours before; staff anytime; no-show marking offers re-booking |
| M8-6 | Google Calendar (busy times, events, Meet links); Zoom and Microsoft Teams meetings; or a fixed meeting URL; on-site with an address |
| M8-7 | Rounds: 1st (default 60 min, online), 2nd (default 90 min, may be on-site) |

---

## M9 · Automated messaging (P2 core, P3 full)

| ID | Requirement | Phase |
|----|-------------|-------|
| M9-1 | Triggers: pass/invitation, follow-up, confirmed (with `.ics`), day-before reminder, rejection after human confirmation, next-round invitation | P2 |
| M9-2 | More triggers: 5- and 3-day nurture with answers to the candidate's concerns, interview day, thanks, CV missing, no-show, custom (when + timing) | P3 |
| M9-3 | Template editor: subject, body, merge fields (`{name}`, `{company}`, `{job}`, `{booking_url}`, `{interview_at}`, `{tool}`, `{meeting_url}`, `{upload_url}`, `{consent_url}`), live preview, required-field validation, timing (immediately / same day 18:00 / day before 18:00 / next day 10:00 / +3 days 10:00 / +1 week 10:00), on/off, per-client override. Japanese business-mail defaults shipped | P2 basic, P3 full |
| M9-4 | Sender: mask0 domain with display name "{client} 採用担当" and Reply-To the org's inbound address (P2); Gmail "send as" via OAuth (P3) | P2 / P3 |
| M9-5 | Send log with delivery status from webhooks; "opened" means the candidate opened the personal page (no tracking pixels) | P2 |
| M9-6 | Quiet hours (21:00–08:00 JST) defer scheduled sends; every send is idempotent; a per-org test mode logs sends without delivering them | P2 |
| M9-7 | Paste texts: auto-reply, nudge, re-invite | P1 / P3 |

---

## M10 · Analytics (分析) (P3)

| ID | Requirement |
|----|-------------|
| M10-1 | Period: this month / last month / last 3 months / custom |
| M10-2 | Funnel notified → entered → passed → invitation opened → interview set → held → offer → hired, conversion per step, the worst step highlighted with a suggested fix |
| M10-3 | Response lag (invite → open, by bucket) against the interview rate; open → booking time |
| M10-4 | Per board: volume, pass rate, days to respond, interview rate |
| M10-5 | Open rate by send hour; average days per stage |
| M10-6 | Everything computed from the `events` table (reproducible, no hand-kept counters) |

---

## M11 · Interviews (面接) (P4)

| ID | Requirement |
|----|-------------|
| M11-1 | Day list with round, candidate, time, tool, join link |
| M11-2 | **Prep:** document highlights, purpose of the round, AI question suggestions grouped (experience / consistency with documents / motivation and values), standard or deep mode; pick, reorder, edit, print |
| M11-3 | **Notes and rating** by the interviewer, per criterion |
| M11-4 | **Decision:** pass / next round (new invitation) / fail / withdrawn, with an undo window before any email goes out |
| M11-5 | **Recording and transcript:** a meeting bot joins Meet / Zoom / Teams under a configurable name, announced in the confirmation email, with an opt-out |
| M11-6 | **AI report:** per-criterion evaluation with timestamped evidence, summary, candidate needs, comparison with other candidates, shown next to the interviewer's own rating |
| M11-7 | **Live assist:** rolling transcript and suggestions (deep-dive, inconsistency, skill check, missed topic, …) |

---

## M12 · AI interviewer (P5, behind a feature flag)

| ID | Requirement |
|----|-------------|
| M12-1 | Per job, an AI interview can be round 1: fixed questions, follow-up depth, time limit, a rubric per question |
| M12-2 | The candidate takes it from the personal page before a deadline: text chat first, voice later; explicit consent; a human interview on request |
| M12-3 | Events: invited, started, completed, aborted, scored (per-question scores, total, band); transcript stored |
| M12-4 | People review and decide; an AI score never rejects anyone on its own |
| M12-5 | Reminders before the deadline |

---

## M13 · Platform, privacy and compliance (P1 → P3)

| ID | Requirement | Phase |
|----|-------------|-------|
| M13-1 | Audit log: logins, exports, document downloads, verdict changes, decisions, role changes, deletions | P1 |
| M13-2 | Retention per org, 30–730 days (default 180), for documents and personal data of rejected or withdrawn applications; nightly purge; disclosure / correction / deletion requests handled from the admin screen | P1 |
| M13-3 | Email and phone encrypted at rest with separate hashes for lookup; private storage; signed URLs that expire within minutes | P1 |
| M13-4 | AI usage metered per org (tokens, cost) with plan limits | P1 metering, P3 limits |
| M13-5 | Billing by clients / jobs / AI volume (invoice first, card later) | P3 |
| M13-6 | Demo sandbox reset nightly | P1 |
