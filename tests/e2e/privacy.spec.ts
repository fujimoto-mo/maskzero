import { expect, test } from "@playwright/test";
import {
  applyAsCandidate,
  openSandbox,
  passedCandidate,
  phonePage,
  testDb,
  uniqueName,
} from "./support";

// Sales deck p. 11 ("自動の連絡") and p. 13 ("安心して使えるしくみ"): pass notices, confirmations and
// day-before reminders go out by themselves; candidates' pages are private, unguessable and kept
// out of search; the entry page says the AI reads the documents and asks for consent; rejected
// candidates' documents are deleted after the retention period. Tenant isolation is covered by
// tests/db/rls.test.ts.

const db = testDb();
const INNGEST = process.env.INNGEST_BASE_URL ?? "http://localhost:8288";
const STORAGE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

test.afterAll(async () => {
  await db.end();
});

const messagesFor = (name: string) => db<{ trigger: string; status: string }[]>`
  select m.trigger, m.status from messages m
  join applications a on a.id = m.application_id
  join candidates c on c.id = a.candidate_id
  where c.name = ${name}`;

test("pass notice, confirmation and the waiting reminder, all in the send log", async ({
  browser,
}) => {
  const { page, base, entryUrl } = await openSandbox(browser);
  const { context: phone, page: candidate } = await phonePage(browser);
  const name = uniqueName("連絡 確認");
  const portal = await passedCandidate(page, candidate, { base, entryUrl, name });

  // The pass notice with the booking link waits out quiet hours (21:00–08:00 JST).
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Tokyo" })
      .format(new Date())
      .replace("24", "0"),
  );
  if (hour >= 8 && hour < 21) {
    await expect
      .poll(async () => (await messagesFor(name)).map((m) => m.trigger), { timeout: 60_000 })
      .toContain("pass");
  }

  await candidate.goto(portal);
  await candidate.getByRole("link", { name: "面接の日程を選ぶ" }).click();
  await candidate.locator("button[aria-pressed]").first().click();
  await candidate.getByRole("button", { name: "この内容で送信する" }).click();
  await expect(candidate.getByText("面接の日時が確定しました")).toBeVisible();
  await expect
    .poll(async () => (await messagesFor(name)).map((m) => `${m.trigger}:${m.status}`), {
      timeout: 60_000,
    })
    .toContain("confirmed:dry_run");

  // The reminders are a run sleeping until the day before (their timing is in the unit tests).
  const [interview] = await db<{ id: string }[]>`
    select i.id from interviews i
    join applications a on a.id = i.application_id
    join candidates c on c.id = a.candidate_id
    where c.name = ${name} and i.status = 'scheduled'`;
  await expect
    .poll(
      async () => {
        const events = (await (
          await fetch(`${INNGEST}/v1/events?name=interview/scheduled&limit=50`)
        ).json()) as { data: { internal_id: string; data: { interviewId?: string } }[] };
        const event = events.data.find((e) => e.data.interviewId === interview!.id);
        if (!event) return [];
        const runs = (await (
          await fetch(`${INNGEST}/v1/events/${event.internal_id}/runs`)
        ).json()) as { data: { run_id: string }[] };
        // Each run's own record: the event's run list can report a sleeping run as completed.
        return Promise.all(
          runs.data.map(async (r) => {
            const run = (await (await fetch(`${INNGEST}/v1/runs/${r.run_id}`)).json()) as {
              data: { status: string };
            };
            return run.data.status;
          }),
        );
      },
      { timeout: 30_000 },
    )
    .toContain("Running");

  // The send log shows each message; a sandbox only records them.
  await page.goto(`${base}/settings?tab=log`);
  await expect(
    page.getByText("面接日時の確定（カレンダー登録用ファイル付き）").first(),
  ).toBeVisible();
  await expect(page.getByText("記録のみ").first()).toBeVisible();

  // Sending from the recruiter's Gmail is a setting, open once Gmail is connected.
  await page.goto(`${base}/settings?tab=integrations`);
  await expect(page.getByLabel("連携したGmailから送る")).toBeDisabled();
  await expect(page.getByLabel("mask0から送る")).toBeVisible();
  await phone.close();
});

test("private pages, the AI notice and consent, and documents deleted after rejection", async ({
  browser,
}) => {
  const { page, base, entryUrl } = await openSandbox(browser);
  const { context: phone, page: candidate } = await phonePage(browser);
  const name = uniqueName("個人 情報");

  // The entry page tells the candidate the AI reads the documents, and for how long they're kept.
  const portal = await applyAsCandidate(candidate, entryUrl, {
    name,
    onConfirmStep: async () => {
      await expect(candidate.getByText("個人情報の取り扱いについて")).toBeVisible();
      await expect(
        candidate.getByText(/AI（米国のAnthropic社が提供するClaude）が読み取り/),
      ).toBeVisible();
      await expect(candidate.getByText(/日後に自動で削除します/)).toBeVisible();
    },
  });
  const [consent] = await db<{ kind: string; granted: boolean }[]>`
    select k.kind, k.granted from consents k
    join applications a on a.id = k.application_id
    join candidates c on c.id = a.candidate_id
    where c.name = ${name} and k.kind = 'privacy'`;
  expect(consent).toEqual({ kind: "privacy", granted: true });

  // Candidate pages stay out of search; the personal page passes no referrer on.
  for (const path of [entryUrl, portal]) {
    await candidate.goto(path);
    await expect(candidate.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  }
  await expect(candidate.locator('meta[name="referrer"]')).toHaveAttribute(
    "content",
    "no-referrer",
  );
  const robots = await (await candidate.request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /a/");
  expect(robots).toContain("Disallow: /p/");
  // A made-up personal-page address finds nothing.
  const guess = await candidate.request.get("/p/AAAAAAAAAAAAAAAAAAAAAA");
  expect(guess.status()).toBe(404);

  // Documents are never public; staff open them through short-lived signed links.
  const [doc] = await db<{ path: string }[]>`
    select d.storage_path as path from documents d
    join applications a on a.id = d.application_id
    join candidates c on c.id = a.candidate_id
    where c.name = ${name}`;
  const open = await candidate.request.get(
    `${STORAGE}/storage/v1/object/public/documents/${doc!.path}`,
  );
  expect(open.ok()).toBe(false);

  // Rejected: the retention clock starts, and once it runs out the documents are deleted.
  await page.goto(`${base}/screening`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(async () => {
    await page.reload();
    await expect(row).not.toContainText("AIが確認中", { timeout: 1000 });
  }).toPass({ timeout: 120_000, intervals: [3000] });
  await row.getByRole("link", { name }).click();
  await page.getByRole("dialog").getByRole("button", { name: "不合格にする" }).click();
  await expect(page.getByText("判断を記録しました")).toBeVisible();
  const [closed] = await db<{ id: string; days: number }[]>`
    select a.id, extract(day from a.purge_after - a.closed_at)::int as days from applications a
    join candidates c on c.id = a.candidate_id
    where c.name = ${name}`;
  expect(closed!.days).toBe(180);

  await db`update applications set purge_after = now() - interval '1 day' where id = ${closed!.id}`;
  await fetch(`${INNGEST}/e/dev`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "retention/purge-requested", data: {} }),
  });
  await expect
    .poll(
      async () => {
        const [left] = await db<{ apps: number; files: number }[]>`
          select (select count(*)::int from applications where id = ${closed!.id}) as apps,
                 (select count(*)::int from storage.objects
                  where bucket_id = 'documents' and name = ${doc!.path}) as files`;
        return left;
      },
      { timeout: 60_000 },
    )
    .toEqual({ apps: 0, files: 0 });
  await phone.close();
});
