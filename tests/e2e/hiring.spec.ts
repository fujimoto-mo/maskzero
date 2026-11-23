import { expect, type Page, test } from "@playwright/test";
import {
  applyAsCandidate,
  openSandbox,
  phonePage,
  testDb,
  uniqueName,
  waitForVerdict,
} from "./support";

// The Phase 1 and 2 exit flows (docs/06): a candidate applies on a phone, the AI screens the
// application, a recruiter passes it, the candidate books an interview that is confirmed at once,
// then moves it, which cancels the first interview and its reminders.

const db = testDb();

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

test("apply on a phone, AI screening, pass, book and reschedule", async ({ browser }) => {
  const { page, base, entryUrl } = await openSandbox(browser);
  const { context: phone, page: candidate } = await phonePage(browser);
  const name = uniqueName();
  const portalUrl = await applyAsCandidate(candidate, entryUrl, { name });

  // The AI's verdict arrives through Inngest.
  const row = await waitForVerdict(page, base, name);

  // The recruiter passes the application, whatever the AI proposed.
  await row.getByRole("link", { name }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "合格にする", exact: true }).click();
  await expect(page.getByText("判断を記録しました")).toBeVisible();

  // The candidate books from their personal page; the first free pick is confirmed at once.
  await candidate.goto(portalUrl);
  await candidate.getByRole("link", { name: "面接の日程を選ぶ" }).click();
  await book(candidate, 3);

  // Then moves it: the first interview is canceled and a new one confirmed.
  await candidate.goto(portalUrl);
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
