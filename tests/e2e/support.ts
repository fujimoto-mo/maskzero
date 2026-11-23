import path from "node:path";
import { type Browser, devices, expect, type Page } from "@playwright/test";
import postgres from "postgres";

// Shared steps for the end-to-end flows. Every spec works in its own /demo sandbox, so specs
// don't see each other's data and need no seeded login.

export const SAMPLE_RESUME = path.join(process.cwd(), "public", "demo", "sample-resume.pdf");

/** Read-only checks against the local stack, like the database tests. */
export function testDb() {
  return postgres(
    process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    { max: 1, onnotice: () => {} },
  );
}

// The app rate-limits by IP (the first X-Forwarded-For hop): five /demo sandboxes and twenty
// entries an hour. Each browser context presents its own made-up address, so a full run stays
// under both however often it is repeated.
const madeUpAddress = () => ({
  "x-forwarded-for": `10.${rand(256)}.${rand(256)}.${rand(256)}`,
});

/** A recruiter signed in to a fresh sandbox company as its admin. */
export async function openSandbox(browser: Browser) {
  const context = await browser.newContext({
    locale: "ja-JP",
    extraHTTPHeaders: madeUpAddress(),
  });
  const page = await context.newPage();
  await page.goto("/demo");
  await page.getByRole("button", { name: "管理画面を開く" }).click();
  await page.waitForURL(/\/app\/demo-[0-9a-f]+\/main\/dashboard$/, { timeout: 120_000 });
  const base = new URL(page.url()).pathname.replace(/\/dashboard$/, "");
  const entryUrl = await page.getByRole("link", { name: "応募者として試す" }).getAttribute("href");
  expect(entryUrl).toMatch(/^\/a\//);
  return { context, page, base, orgSlug: base.split("/")[2]!, entryUrl: entryUrl! };
}

/** A candidate on a phone, without a session. */
export async function phonePage(browser: Browser) {
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    locale: "ja-JP",
    extraHTTPHeaders: madeUpAddress(),
  });
  return { context, page: await context.newPage() };
}

export const uniqueName = (prefix = "動作 確認") => `${prefix}${Date.now().toString().slice(-5)}`;

/**
 * Fills in the entry page and submits it. Returns the personal page's path. Answers to the job's
 * own questions are picked as the first option unless `answers` gives one by label.
 */
export async function applyAsCandidate(
  candidate: Page,
  entryUrl: string,
  {
    name,
    email = `e2e-${Date.now()}-${rand(1000)}@example.com`,
    payBand = "こだわらない",
    startTiming = "すぐに",
    files = [SAMPLE_RESUME],
    onConfirmStep,
  }: {
    name: string;
    email?: string;
    payBand?: string;
    startTiming?: string;
    files?: string[];
    /** Runs on the last step, before consenting: to check what the candidate is told. */
    onConfirmStep?: () => Promise<void>;
  },
) {
  await candidate.goto(entryUrl);
  await candidate.getByRole("button", { name: "応募をはじめる" }).click();
  await candidate.locator("#name").fill(name);
  await candidate.locator("#phone").fill("090-0000-9999");
  await candidate.locator("#email").fill(email);
  await candidate.locator("#prefecture").selectOption("東京都");
  await candidate.locator("#city").fill("架空区みなと町");
  await candidate.locator("#payBand").selectOption(payBand);
  await candidate.locator("#startTiming").selectOption(startTiming);
  // The job's own questions: the first choice of each, unless already answered.
  for (const group of await candidate.locator("fieldset fieldset").all()) {
    const choice = group.locator("input[type=radio], input[type=checkbox]").first();
    if ((await choice.count()) > 0 && !(await choice.isChecked())) await choice.check();
  }
  for (const select of await candidate.locator('select[id^="question-"]').all()) {
    await select.selectOption({ index: 1 });
  }
  await candidate.getByRole("button", { name: "次へ" }).click();
  for (const [index, file] of files.entries()) {
    await candidate.locator('input[type="file"]').nth(index).setInputFiles(file);
  }
  await candidate.getByRole("button", { name: "次へ" }).click();
  await onConfirmStep?.();
  await candidate.getByRole("checkbox", { name: "上記の内容に同意して応募する" }).check();
  // Entries faster than three seconds are treated as bots and quietly dropped.
  await candidate.waitForTimeout(3000);
  await candidate.getByRole("button", { name: "応募する" }).click();
  await expect(candidate.getByText("応募を受け付けました")).toBeVisible({ timeout: 30_000 });
  const portal = await candidate.getByRole("link", { name: /\/p\// }).getAttribute("href");
  return new URL(portal!).pathname;
}

/** Waits on the screening list until the AI's verdict for `name` has arrived (through Inngest). */
export async function waitForVerdict(page: Page, base: string, name: string, query = "") {
  await page.goto(`${base}/screening${query}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(async () => {
    await page.reload();
    await expect(row).toBeVisible({ timeout: 2000 });
    await expect(row).not.toContainText("AIが確認中", { timeout: 1000 });
  }).toPass({ timeout: 120_000, intervals: [3000] });
  return row;
}

/**
 * A candidate who applied and whom the recruiter passed by hand, whatever the AI proposed. Returns
 * the personal page's path; the booking link is on it.
 */
export async function passedCandidate(
  page: Page,
  candidate: Page,
  { base, entryUrl, name }: { base: string; entryUrl: string; name: string },
) {
  const portal = await applyAsCandidate(candidate, entryUrl, { name });
  const row = await waitForVerdict(page, base, name);
  await row.getByRole("link", { name }).click();
  await page.getByRole("dialog").getByRole("button", { name: "合格にする", exact: true }).click();
  await expect(page.getByText("判断を記録しました").first()).toBeVisible();
  return portal;
}

/** An 1000×750 PNG drawn in the page, for job image uploads (the checks want at least 800×600). */
export async function pngImage(page: Page, name = "job.png") {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 750;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#0f6e5c";
    ctx.fillRect(0, 0, 1000, 750);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(100, 100, 400, 300);
    return canvas.toDataURL("image/png");
  });
  return { name, mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1]!, "base64") };
}

/** Picks an option from a Radix select by its trigger's id. */
export async function pick(page: Page, triggerId: string, option: string) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

function rand(n: number) {
  return Math.floor(Math.random() * n);
}
