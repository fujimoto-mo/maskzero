import { expect, test } from "@playwright/test";
import { openSandbox, passedCandidate, phonePage, testDb, uniqueName } from "./support";

// Sales deck p. 11, "AI面接官に任せる": the AI interviews with the questions set for the job, asks
// follow-ups depending on the answers, and scores each question and the whole. The feature is
// behind the ai_interviewer flag, which mask0 staff set with SQL.

const db = testDb();
const SALES_JOB = "法人営業（オフィス機器）";
const LONG =
  "前職では営業チームのリーダーとして、新しい顧客管理の仕組みを導入しました。担当者ごとの訪問記録をまとめ、週に一度の振り返りを始めた結果、半年で成約率が上がりました。";

test.afterAll(async () => {
  await db.end();
});

test("the AI asks the job's questions, follows up, and scores each answer", async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, base, entryUrl, orgSlug } = await openSandbox(browser);
  await db`update organizations set feature_flags = array_append(feature_flags, 'ai_interviewer')
           where slug = ${orgSlug}`;
  const [job] = await db<{ id: string }[]>`
    select j.id from jobs j join organizations o on o.id = j.org_id
    where o.slug = ${orgSlug} and j.title = ${SALES_JOB}`;

  // The recruiter turns it on for the job and sets the questions.
  await page.goto(`${base}/jobs/${job!.id}/ai-interview`);
  const enabled = page.getByRole("switch", { name: "この求人でAI面接を使う" });
  if ((await enabled.getAttribute("aria-checked")) !== "true") await enabled.click();
  await page.getByRole("button", { name: "質問の例を入れる" }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("AI面接の設定を保存しました")).toBeVisible();

  // A passed candidate is invited to it instead of to booking.
  const { context: phone, page: candidate } = await phonePage(browser);
  const name = uniqueName("AI 面接");
  const portal = await passedCandidate(page, candidate, { base, entryUrl, name });
  await candidate.goto(portal);
  await candidate.getByRole("link", { name: "AI面接に進む" }).click();
  await candidate.getByLabel("上記の内容を確認し、AIによる面接と評価に同意します。").check();
  await candidate.getByRole("button", { name: "AI面接を始める" }).click();
  await expect(candidate.getByText(/質問 1 \/ 3/)).toBeVisible();

  const send = async (answer: string) => {
    await candidate.locator("#ai-answer").fill(answer);
    await candidate.getByRole("button", { name: "回答を送る" }).click();
    await expect(candidate.getByRole("button", { name: "送信中…" })).toHaveCount(0, {
      timeout: 30_000,
    });
  };
  // A thin answer gets a follow-up question; full answers move on to the end.
  await send("はい、あります。");
  await expect(
    candidate.getByText("もう少し詳しく教えてください。具体的な場面を一つ挙げていただけますか。"),
  ).toBeVisible();
  const done = candidate.getByText("ご回答ありがとうございました");
  for (let i = 0; i < 6 && !(await done.isVisible()); i++) await send(LONG);
  await expect(done).toBeVisible();

  // The recruiter sees a score per question and overall, as a reference for their own decision.
  await page.goto(`${base}/ai-interviews`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(async () => {
    await page.reload();
    await expect(row).toContainText("評価済み", { timeout: 2000 });
  }).toPass({ timeout: 120_000, intervals: [3000] });
  await row.getByRole("link").first().click();
  await expect(page.getByText("AIの評価（参考）")).toBeVisible();
  await expect(page.getByText(/AIの評価：\d \/ 5/)).toHaveCount(3);
  await expect(page.getByText("AIの追加質問").first()).toBeVisible();
  const [session] = await db<{ status: string; band: string | null; scores: unknown[] }[]>`
    select s.status, s.band, s.scores from ai_interview_sessions s
    join applications a on a.id = s.application_id
    join candidates c on c.id = a.candidate_id
    where c.name = ${name}`;
  expect(session?.status).toBe("scored");
  expect(session?.band).toMatch(/^[A-D]$/);
  expect(session?.scores).toHaveLength(3);

  // Blind review: a person scores the answers without seeing the AI's, then compares.
  await page.goto(`${base}/ai-interviews/review`);
  for (const group of await page.getByRole("radiogroup").all()) {
    await group.getByRole("radio", { name: "3", exact: true }).click();
  }
  await page.getByRole("button", { name: "評価を保存する" }).click();
  await expect(page.getByText(/AIと(同じ評価でした|評価が分かれました)/)).toBeVisible();
  await phone.close();
});
