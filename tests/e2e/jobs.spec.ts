import { expect, test } from "@playwright/test";
import {
  applyAsCandidate,
  openSandbox,
  phonePage,
  pick,
  pngImage,
  testDb,
  uniqueName,
} from "./support";

// Sales deck pp. 6–7: write a posting once with the boards' own fields, check it before
// publishing, paste it field by field; issue an entry URL per job and board, paste the reply text
// with the URL into the board's auto-reply, and see which board each application came from.

const db = testDb();
const SALES_JOB = "法人営業（オフィス機器）";

test.afterAll(async () => {
  await db.end();
});

test("a new posting: checks block publishing, the AI drafts only the prose, six images, copy per field", async ({
  browser,
}) => {
  const { page, base, context } = await openSandbox(browser);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${base}/jobs`);
  await page.getByRole("button", { name: "求人をつくる" }).click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);

  // The pre-publish checks list what is missing, and publishing waits for them.
  await expect(page.getByText("「職種名」を入力してください。")).toBeVisible();
  await expect(page.getByText("メイン画像（1枚目）を登録してください。")).toBeVisible();
  await page.getByRole("button", { name: "掲載する" }).click();
  await expect(
    page.getByText("公開前チェックのエラーを直してから掲載してください。"),
  ).toBeVisible();

  // The AI drafts the prose; the job name, pay and requirements stay as the recruiter left them.
  await page.locator("#field-title").fill("ルート営業");
  await page.locator("#field-mustHave").fill("普通自動車免許");
  await page.getByRole("button", { name: "AIで下書き" }).click();
  await expect(
    page.getByText("AIの下書きを入れました。内容を確かめてから保存してください。"),
  ).toBeVisible();
  await expect(page.locator("#field-description")).not.toHaveValue("");
  await expect(page.locator("#field-title")).toHaveValue("ルート営業");
  await expect(page.locator("#field-mustHave")).toHaveValue("普通自動車免許");
  await expect(page.locator("#field-pay")).toHaveValue("");

  // Text over a board's limit is flagged before publishing.
  await page.locator("#field-description").fill("あ".repeat(760));
  await expect(page.getByText(/engageは750文字まで（いま760文字）/)).toBeVisible();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
  await expect(
    page.getByText("「仕事内容」が750文字を超えています（いま760文字）。").first(),
  ).toBeVisible();
  await expect(page.getByText("「職種名」を入力してください。")).toBeHidden();

  // Up to six images; the first is the main one.
  await page.getByRole("tab", { name: "画像" }).click();
  await expect(page.locator('input[type="file"]')).toHaveCount(6);
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(await pngImage(page));
  await expect(page.getByText("画像を登録しました")).toBeVisible();
  await expect(page.getByText("メイン画像（1枚目）を登録してください。")).toBeHidden();

  // Each board's view lists the fields in its own order, each with its own copy button.
  for (const board of ["Indeed", "engage", "その他の媒体"]) {
    await page.getByRole("tab", { name: board }).click();
    await expect(
      page.getByRole("tabpanel").getByRole("button", { name: "コピー" }).first(),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Indeed" }).click();
  const titleRow = page
    .getByRole("tabpanel")
    .locator("li, tr, div")
    .filter({ hasText: /^職種名/ });
  await titleRow.getByRole("button", { name: "コピー" }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("ルート営業");
});

test("publishing a complete posting, and stopping it", async ({ browser }) => {
  const { page, base } = await openSandbox(browser);
  await page.goto(`${base}/jobs`);
  await page.getByRole("link", { name: SALES_JOB }).first().click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]{36}$/);

  // The sample posting has every field but no main image yet.
  await expect(page.getByText("メイン画像（1枚目）を登録してください。")).toBeVisible();
  await page.getByRole("tab", { name: "画像" }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(await pngImage(page));
  await expect(page.getByText("画像を登録しました")).toBeVisible();

  await page.getByRole("button", { name: "掲載を止める" }).click();
  await expect(page.getByText("掲載を止めました")).toBeVisible();
  await page.getByRole("button", { name: "掲載する" }).click();
  await expect(page.getByText("掲載を始めました")).toBeVisible();
  await expect(page.getByText("掲載中").first()).toBeVisible();
});

test("an entry URL per job and board, its reply text, on/off, and the source on each application", async ({
  browser,
}) => {
  const { page, base, context, orgSlug } = await openSandbox(browser);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${base}/entry-urls`);

  await pick(page, "entry-job", SALES_JOB);
  await pick(page, "entry-channel", "エン転職");
  await page.getByRole("button", { name: "発行する" }).click();
  await expect(page.getByText("URLを発行しました")).toBeVisible();
  // One URL per job and board.
  await pick(page, "entry-job", SALES_JOB);
  await pick(page, "entry-channel", "エン転職");
  await page.getByRole("button", { name: "発行する" }).click();
  await expect(page.getByText("この求人と媒体のURLはすでにあります。")).toBeVisible();

  const [url] = await db<{ code: string }[]>`
    select e.code from entry_urls e
    join organizations o on o.id = e.org_id
    where o.slug = ${orgSlug} and e.channel = 'エン転職'`;
  expect(url).toBeDefined();

  // The reply text for the board's auto-reply carries the URL and the job.
  const row = page.getByRole("row").filter({ hasText: "エン転職" });
  await row.getByRole("button", { name: /返信文/ }).click();
  const reply = await page.evaluate(() => navigator.clipboard.readText());
  expect(reply).toContain(`/a/${url!.code}`);
  expect(reply).toContain(SALES_JOB);

  // Intake can be paused per URL.
  const { context: phone, page: candidate } = await phonePage(browser);
  await row.getByRole("switch", { name: "エン転職の受付" }).click();
  await expect(page.getByText("受付を止めました")).toBeVisible();
  await candidate.goto(`/a/${url!.code}`);
  await expect(candidate.getByText("この求人の応募受付は終了しました")).toBeVisible();
  await row.getByRole("switch", { name: "エン転職の受付" }).click();
  await expect(page.getByText("受付を再開しました")).toBeVisible();

  // An application through it is recorded with its board and job.
  const name = uniqueName("媒体 確認");
  await applyAsCandidate(candidate, `/a/${url!.code}`, { name });
  const [application] = await db<{ channel: string; title: string }[]>`
    select a.channel, j.title from applications a
    join candidates c on c.id = a.candidate_id
    join jobs j on j.id = a.job_id
    where c.name = ${name}`;
  expect(application).toEqual({ channel: "エン転職", title: SALES_JOB });
  await page.goto(`${base}/screening`);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText("エン転職");
  await phone.close();
});
