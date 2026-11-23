import { expect, test } from "@playwright/test";
import {
  applyAsCandidate,
  openSandbox,
  phonePage,
  testDb,
  uniqueName,
  waitForVerdict,
} from "./support";

// Sales deck p. 8 and the FAQ (p. 14): the recruiter sets the criteria and the lines, the AI reads
// the documents and sorts applicants into pass / check / fail with its reasons and the quoted
// evidence, a person confirms every rejection, and any verdict can be changed by hand. Unfair
// criteria can't be set (p. 13).

const db = testDb();

test.afterAll(async () => {
  await db.end();
});

test("reasons and quotes, a person confirms rejections, verdicts change by hand", async ({
  browser,
}) => {
  const { page, base } = await openSandbox(browser);
  await page.goto(`${base}/screening`);
  const drawer = page.getByRole("dialog");

  // The AI's reasons, each criterion's result, and the quote it relied on.
  await page.getByRole("link", { name: "青葉 美咲" }).click();
  await expect(drawer.getByText("判定の理由")).toBeVisible();
  await expect(drawer.getByText("根拠（書類から原文のまま引用）").first()).toBeVisible();
  await expect(
    drawer.locator("blockquote").filter({ hasText: "普通自動車第一種運転免許 取得" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // A failing verdict waits for a person; confirming it rejects the application.
  const shirakawa = page.getByRole("row").filter({ hasText: "白川 奈央" });
  await expect(shirakawa).toContainText("不合格（確認待ち）");
  await shirakawa.getByRole("checkbox", { name: "白川 奈央を選択" }).check();
  await page.getByRole("button", { name: "不合格を確定する" }).click();
  await expect(page.getByText("1件の不合格を確定しました")).toBeVisible();
  const [rejected] = await db<{ verdict: string; outcome: string }[]>`
    select a.verdict, a.outcome from applications a
    join candidates c on c.id = a.candidate_id
    join organizations o on o.id = a.org_id
    where c.name = '白川 奈央' and o.slug = ${base.split("/")[2]!}`;
  expect(rejected).toEqual({ verdict: "fail", outcome: "rejected" });

  // Any verdict can be changed by hand, and changed back to the AI's.
  const verdictOf = async (name: string) => {
    const [row] = await db<{ verdict: string }[]>`
      select a.verdict from applications a
      join candidates c on c.id = a.candidate_id
      join organizations o on o.id = a.org_id
      where c.name = ${name} and o.slug = ${base.split("/")[2]!}`;
    return row!.verdict;
  };
  const onami = page.getByRole("row").filter({ hasText: "大波 湊" });
  await expect(onami).toContainText("要確認");
  await onami.getByRole("link", { name: "大波 湊" }).click();
  await drawer.getByRole("button", { name: "不合格にする" }).click();
  await expect(page.getByText("判断を記録しました")).toBeVisible();
  await expect.poll(() => verdictOf("大波 湊")).toBe("manual_fail");
  await drawer.getByRole("button", { name: "AIの判定に戻す" }).click();
  await expect.poll(() => verdictOf("大波 湊")).toBe("check");
  await page.goto(`${base}/screening`);
  await expect(onami).toContainText("要確認");
});

test("the recruiter's criteria decide the AI's verdicts; unfair criteria are refused", async ({
  browser,
}) => {
  const { page, base, entryUrl } = await openSandbox(browser);
  await page.goto(`${base}/screening`);
  await page.getByRole("link", { name: "選考条件を設定" }).click();
  await page.waitForURL(/\/screening\/criteria\?job=/);

  // Criteria about birthplace, family, gender and the like are refused as they are typed.
  await page.getByRole("button", { name: "条件を追加", exact: true }).click();
  const label = page.getByLabel("条件名").last();
  await label.fill("本籍");
  await expect(page.getByText(/公正な採用選考の観点から設定できません/).first()).toBeVisible();
  // Age needs one of the legal exceptions before it can be saved.
  await label.fill("年齢");
  await expect(
    page.getByText(/年齢に関する条件は、法律で認められた例外に当たる場合だけ/),
  ).toBeVisible();
  await expect(page.getByLabel("例外の理由").last()).toBeVisible();
  await page.getByRole("button", { name: "保存して選考し直す" }).click();
  await expect(
    page.getByText("保存できませんでした。赤字の項目を確認してください。"),
  ).toBeVisible();
  const [age] = await db<{ n: number }[]>`
    select count(*)::int as n from screening_criteria s
    join organizations o on o.id = s.org_id
    where o.slug = ${base.split("/")[2]!} and s.label = '年齢'`;
  expect(age!.n).toBe(0);

  // Keep a single required condition, asked on the entry form: when the candidate can start.
  const remove = page.getByRole("button", { name: "削除", exact: true });
  while ((await remove.count()) > 0) await remove.first().click();
  await page.getByRole("button", { name: "よく使う条件から追加" }).click();
  await page.getByRole("menuitem", { name: "入社できる時期" }).click();
  const required = page.getByRole("switch", { name: "必須" }).last();
  if ((await required.getAttribute("aria-checked")) !== "true") await required.click();
  await page.getByRole("button", { name: "保存して選考し直す" }).click();
  await expect(page.getByText("保存しました。応募者を選考し直しています。")).toBeVisible();

  const { context: phone, page: candidate } = await phonePage(browser);
  const soon = uniqueName("すぐ 入社");
  const late = uniqueName("先 入社");
  await applyAsCandidate(candidate, entryUrl, { name: soon, startTiming: "すぐに" });
  await applyAsCandidate(candidate, entryUrl, { name: late, startTiming: "3か月より先" });

  const pass = await waitForVerdict(page, base, soon);
  await expect(pass).toContainText("書類合格");
  await expect(pass).toContainText("100");
  const fail = await waitForVerdict(page, base, late);
  await expect(fail).toContainText("不合格（確認待ち）");
  await phone.close();
});
