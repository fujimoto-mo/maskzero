import { expect, type Page, test } from "@playwright/test";
import { openSandbox, passedCandidate, phonePage, testDb, uniqueName } from "./support";

// Sales deck p. 9 and p. 10: the recruiter registers when they can interview; a passed candidate
// gets a booking page with only free times, picks up to three, and can say what worries them; the
// first free pick is confirmed, or the recruiter chooses; two people never get the same time; the
// interview goes on Google Calendar with a Meet, Zoom or Teams link.

const db = testDb();

test.afterAll(async () => {
  await db.end();
});

const card = (page: Page, title: string) =>
  page.locator('[data-slot="card"]').filter({ hasText: title }).first();

async function openBooking(candidate: Page, portal: string) {
  await candidate.goto(portal);
  await candidate.getByRole("link", { name: "面接の日程を選ぶ" }).click();
  await candidate.waitForURL(/\/book$/);
  await expect(candidate.locator("button[aria-pressed]").first()).toBeVisible();
}

test("the recruiter confirms the time, and the candidate's concerns get answers", async ({
  browser,
}) => {
  const { page, base, entryUrl } = await openSandbox(browser);
  await page.goto(`${base}/scheduling`);
  const rules = card(page, "受付のルール");
  await rules.getByLabel("担当者が確認して確定する").check();
  await rules.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("保存しました").first()).toBeVisible();

  const concerns = card(page, "応募者の不安への回答");
  await concerns.getByRole("button", { name: "項目を追加" }).click();
  await concerns.getByLabel("気になること").last().fill("残業はどのくらいありますか");
  await concerns
    .getByLabel("回答")
    .last()
    .fill("月10時間ほどです。繁忙期の3月は20時間ほどになります。");
  await concerns.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("保存しました").first()).toBeVisible();

  const { context: phone, page: candidate } = await phonePage(browser);
  const name = uniqueName("担当 確定");
  const portal = await passedCandidate(page, candidate, { base, entryUrl, name });
  await openBooking(candidate, portal);
  const slots = candidate.locator("button[aria-pressed]");
  await slots.nth(0).click();
  await slots.nth(1).click();
  await candidate.getByLabel("残業はどのくらいありますか").check();
  await expect(candidate.getByText("月10時間ほどです。")).toBeVisible();
  await candidate.getByRole("button", { name: "この内容で送信する" }).click();
  await expect(candidate.getByText("ご希望を受け付けました")).toBeVisible();

  // The recruiter sees the request, with the concern, and picks one of the times.
  await page.goto(`${base}/interviews`);
  const request = page.getByRole("listitem").filter({ hasText: name });
  await expect(request).toContainText("日程の確定待ち");
  await expect(request).toContainText("残業はどのくらいありますか");
  await request
    .getByRole("button", { name: /で確定$/ })
    .first()
    .click();
  await expect(page.getByText("日程を確定しました")).toBeVisible();
  const [interview] = await db<{ status: string }[]>`
    select i.status from interviews i
    join applications a on a.id = i.application_id
    join candidates c on c.id = a.candidate_id
    where c.name = ${name}`;
  expect(interview?.status).toBe("scheduled");
  await phone.close();
});

test("two candidates can't take the same time", async ({ browser }) => {
  const { page, base, entryUrl } = await openSandbox(browser);
  const first = await phonePage(browser);
  const second = await phonePage(browser);
  const nameA = uniqueName("先 予約");
  const nameB = uniqueName("後 予約");
  const portalA = await passedCandidate(page, first.page, { base, entryUrl, name: nameA });
  const portalB = await passedCandidate(page, second.page, { base, entryUrl, name: nameB });

  // Both open the booking page while the same time is still free.
  await openBooking(first.page, portalA);
  await openBooking(second.page, portalB);
  const time = await first.page.locator("button[aria-pressed]").first().textContent();
  expect(await second.page.locator("button[aria-pressed]").first().textContent()).toBe(time);

  await first.page.locator("button[aria-pressed]").first().click();
  await first.page.getByRole("button", { name: "この内容で送信する" }).click();
  await expect(first.page.getByText("面接の日時が確定しました")).toBeVisible();

  await second.page.locator("button[aria-pressed]").first().click();
  await second.page.getByRole("button", { name: "この内容で送信する" }).click();
  await expect(second.page.getByText(/ほかの方の予約で埋まってしまいました/)).toBeVisible();

  const rows = await db<{ name: string }[]>`
    select c.name from interviews i
    join applications a on a.id = i.application_id
    join candidates c on c.id = a.candidate_id
    where c.name in (${nameA}, ${nameB}) and i.status = 'scheduled'`;
  expect(rows.map((r) => r.name)).toEqual([nameA]);
  await first.context.close();
  await second.context.close();
});

test("Google Calendar with a Meet, Zoom or Teams link for each interview", async ({ browser }) => {
  test.setTimeout(360_000); // three candidates through screening and booking
  const { page, base, entryUrl, orgSlug } = await openSandbox(browser);

  // A sandbox can't connect real accounts.
  await page.goto(`${base}/settings?tab=integrations`);
  await page.getByRole("link", { name: "カレンダーを連携" }).click();
  await expect(page.getByText("デモ環境では外部サービスと連携できません。")).toBeVisible();

  // So the test connects them in the database; INTEGRATIONS_FAKE stands in for the providers.
  const [org] = await db<{ id: string }[]>`select id from organizations where slug = ${orgSlug}`;
  const scopes = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.freebusy",
  ];
  for (const [provider, granted] of [
    ["google", scopes],
    ["zoom", []],
    ["microsoft", []],
  ] as const) {
    await db`insert into integrations (org_id, provider, account_email, scopes, tokens_enc)
             values (${org!.id}, ${provider}, ${`saiyo@${provider}.example.com`}, ${granted as string[]}, 'fake')`;
  }

  const { context: phone, page: candidate } = await phonePage(browser);
  for (const [tool, link] of [
    ["Google Meet（面接ごとにURLを発行）", /^https:\/\/meet\.google\.com\//],
    ["Zoom（面接ごとにURLを発行）", /^https:\/\/zoom\.us\/j\//],
    ["Microsoft Teams（面接ごとにURLを発行）", /^https:\/\/teams\.microsoft\.com\//],
  ] as const) {
    await page.goto(`${base}/scheduling`);
    const rules = card(page, "受付のルール");
    await rules.getByLabel(tool).check();
    const google = rules.getByRole("switch", { name: "Googleカレンダーに面接を登録する" });
    if ((await google.getAttribute("aria-checked")) !== "true") await google.click();
    await rules.getByRole("button", { name: "保存する" }).click();
    await expect(page.getByText("保存しました").first()).toBeVisible();

    const name = uniqueName("会議 確認");
    const portal = await passedCandidate(page, candidate, { base, entryUrl, name });
    await openBooking(candidate, portal);
    // The connected calendar's busy times (12:00–13:00 in fake mode) are never offered.
    await expect(
      candidate.locator("button[aria-pressed]").filter({ hasText: /^12:00/ }),
    ).toHaveCount(0);
    await candidate.locator("button[aria-pressed]").first().click();
    await candidate.getByRole("button", { name: "この内容で送信する" }).click();
    await expect(candidate.getByText("面接の日時が確定しました")).toBeVisible();

    // The meeting is made before the confirmation goes out, and the email carries its link.
    await expect(async () => {
      const [row] = await db<
        { url: string | null; ids: Record<string, string>; body: string | null }[]
      >`
        select i.meeting_url as url, i.external_ids as ids,
               (select m.body_rendered from messages m
                where m.application_id = a.id and m.trigger = 'confirmed' limit 1) as body
        from interviews i
        join applications a on a.id = i.application_id
        join candidates c on c.id = a.candidate_id
        where c.name = ${name} and i.status = 'scheduled'`;
      expect(row?.url).toMatch(link);
      expect(Object.keys(row!.ids).length).toBeGreaterThan(0);
      expect(row!.body).toContain(row!.url!);
    }).toPass({ timeout: 60_000, intervals: [2000] });
  }
  await phone.close();
});
