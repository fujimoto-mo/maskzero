import { defineConfig } from "@playwright/test";

// End-to-end flows (tests/e2e) against a running app on the local stack with fake AI: start
// `pnpm db:start`, `pnpm env:local` (AI_FAKE=1 is set there), `pnpm dev` and `pnpm inngest:dev`,
// then `pnpm test:e2e`. Set PLAYWRIGHT_CHANNEL=chrome (or msedge) to use an installed browser.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
});
