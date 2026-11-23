import { expect, test } from "@playwright/test";
import { openSandbox, passedCandidate, phonePage, testDb, uniqueName } from "./support";

// Sales deck p. 11, "人が面接する": the AI joins the online interview, transcribes it, suggests
// follow-up questions as it goes, and writes an evaluation report afterwards. INTEGRATIONS_FAKE's
// meeting bot replays an invented interview, one line every 4 seconds, and leaves 2 minutes later.

const db = testDb();

test.afterAll(async () => {
  await db.end();
});

test("prep questions, live transcript and suggestions, then the AI report", async ({ browser }) => {
  test.setTimeout(420_000);
  const { page, base } = await openSandbox(browser);
  const entryUrl = await page.getByRole("link", { name: "応募者として試す" }).getAttribute("href");

  // The company records interviews (with the candidate's say, on their personal page).
  await page.goto(`${base}/settings?tab=company`);
  await page.getByLabel("面接を録画・文字起こしする").check();
  await page.getByRole("button", { name: "保存する" }).first().click();
  await expect(page.getByText("保存しました").first()).toBeVisible();

  const { context: phone, page: candidate } = await phonePage(browser);
  const name = uniqueName("面接 記録");
  const portal = await passedCandidate(page, candidate, { base, entryUrl: entryUrl!, name });
  await candidate.goto(portal);
  await candidate.getByRole("link", { name: "面接の日程を選ぶ" }).click();
  await candidate.locator("button[aria-pressed]").first().click();
  await candidate.getByRole("button", { name: "この内容で送信する" }).click();
  await expect(candidate.getByText("面接の日時が確定しました")).toBeVisible();
  const [interview] = await db<{ id: string }[]>`
    select i.id from interviews i
    join applications a on a.id = i.application_id
    join candidates c on c.id = a.candidate_id
    where c.name = ${name} and i.status = 'scheduled'`;
  const workspace = `${base}/meetings/${interview!.id}`;

  // Before: questions suggested from the documents, grouped.
  await page.goto(workspace);
  await expect(page.getByRole("link", { name: "会議に参加" })).toBeVisible();
  await page.getByRole("button", { name: "質問を提案してもらう" }).click();
  await expect(page.getByText("質問を提案しました")).toBeVisible();
  for (const group of ["経験", "書類との一貫性", "志望動機・価値観"]) {
    await expect(page.getByText(group, { exact: true }).first()).toBeVisible();
  }

  // During: the transcript, and follow-up suggestions as the conversation goes on.
  await page.goto(`${workspace}/live`);
  await expect(page.getByText(/本日はお時間をいただきありがとうございます/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("深掘り").first()).toBeVisible({ timeout: 120_000 });

  // After: the bot's transcript becomes the interview's, and the AI writes the report.
  await page.goto(`${workspace}?tab=report`);
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/AIの評価：平均/)).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 300_000, intervals: [5000] });
  const [report] = await db<{ status: string; source: string }[]>`
    select r.status, t.source from interview_reports r
    join interview_transcripts t on t.interview_id = r.interview_id
    where r.interview_id = ${interview!.id}`;
  expect(report).toEqual({ status: "ready", source: "bot" });
  await phone.close();
});
