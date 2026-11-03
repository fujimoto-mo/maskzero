import path from "node:path";
import { devices, expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

// The Phase 1 and 2 exit flows (docs/06): a candidate applies on a phone, the AI screens the
// application, a recruiter passes it, the candidate books an interview that is confirmed at once,
// then moves it, which cancels the first interview and its reminders. Runs in a fresh /demo
// sandbox, so it needs no seeded login.

const SAMPLE_RESUME = path.join(process.cwd(), "public", "demo", "sample-resume.pdf");
// Local stack only, like the database tests.
const db = postgres(
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { max: 1, onnotice: () => {} },
);

test.afterAll(async () => {
  await db.end();
});

/** Picks the first free times on the booking page and sends them. */
async function book(candidate: Page, picks: number) {
  const slots = candidate.locator("button[aria-pressed]");
  await expect(slots.first()).toBeVisible();
  for (let i = 0; i < picks; i++) await slots.nth(i).click();
  await candidate.getByRole("button", { name: "この内容で送信する" }).click();
  await expect(candidate.getByText("面接の日時が確定しました")).toBeVisible();
}

test("apply on a phone, AI screening, pass, book and reschedule", async ({ browser, page }) => {
  // A recruiter: their own sandbox company, signed in as its admin.
  await page.goto("/demo");
  await page.getByRole("button", { name: "管理画面を開く" }).click();
  await page.waitForURL(/\/app\/demo-[0-9a-f]+\/main\/dashboard$/);
  const base = page.url().replace(/\/dashboard$/, "");
  const entryUrl = await page.getByRole("link", { name: "応募者として試す" }).getAttribute("href");
  expect(entryUrl).toMatch(/^\/a\//);

  // A candidate on a phone, without a session.
  const phone = await browser.newContext({ ...devices["Pixel 7"], locale: "ja-JP" });
  const candidate = await phone.newPage();
  const name = `動作 確認${Date.now().toString().slice(-4)}`;
  await candidate.goto(entryUrl!);
  await candidate.getByRole("button", { name: "応募をはじめる" }).click();
  await candidate.locator("#name").fill(name);
  await candidate.locator("#phone").fill("090-0000-9999");
  await candidate.locator("#email").fill(`e2e-${Date.now()}@example.com`);
  await candidate.locator("#prefecture").selectOption("東京都");
  await candidate.locator("#city").fill("架空区みなと町");
  await candidate.locator("#payBand").selectOption("こだわらない");
  await candidate.locator("#startTiming").selectOption("すぐに");
  await candidate.getByRole("button", { name: "次へ" }).click();
  await candidate.locator('input[type="file"]').first().setInputFiles(SAMPLE_RESUME);
  await candidate.getByRole("button", { name: "次へ" }).click();
  await candidate.getByRole("checkbox", { name: "上記の内容に同意して応募する" }).check();
  // Entries faster than three seconds are treated as bots and quietly dropped.
  await candidate.waitForTimeout(3000);
  await candidate.getByRole("button", { name: "応募する" }).click();
  await expect(candidate.getByText("応募を受け付けました")).toBeVisible({ timeout: 30_000 });
  const portalUrl = await candidate.getByRole("link", { name: /\/p\// }).getAttribute("href");

  // The AI's verdict arrives through Inngest.
  await page.goto(`${base}/screening`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 2000 });
    await expect(row).not.toContainText("AIが確認中", { timeout: 1000 });
  }).toPass({ timeout: 120_000, intervals: [3000] });

  // The recruiter passes the application, whatever the AI proposed.
  await row.getByRole("link", { name }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "合格にする", exact: true }).click();
  await expect(page.getByText("判断を記録しました")).toBeVisible();

  // The candidate books from their personal page; the first free pick is confirmed at once.
  await candidate.goto(portalUrl!);
  await candidate.getByRole("link", { name: "面接の日程を選ぶ" }).click();
  await book(candidate, 3);

  // Then moves it: the first interview is canceled and a new one confirmed.
  await candidate.goto(portalUrl!);
  await candidate.getByRole("button", { name: "日程を変更する" }).click();
  await candidate.waitForURL(/\/book$/);
  await book(candidate, 1);

  const interviews = await db<{ status: string }[]>`
    select i.status from interviews i
    join applications a on a.id = i.application_id
    join candidates c on c.id = a.candidate_id
    where c.name = ${name}
    order by i.created_at`;
  expect(interviews.map((i) => i.status)).toEqual(["canceled", "scheduled"]);

  // Both confirmations are in the send log (a sandbox never sends); the canceled interview's
  // reminders stop, and they recheck the interview before sending in any case.
  await expect(async () => {
    const [sent] = await db<{ n: number }[]>`
      select count(*)::int as n from messages m
      join applications a on a.id = m.application_id
      join candidates c on c.id = a.candidate_id
      where c.name = ${name} and m.trigger = 'confirmed' and m.status = 'dry_run'`;
    expect(sent!.n).toBe(2);
  }).toPass({ timeout: 60_000, intervals: [2000] });

  await phone.close();
});
