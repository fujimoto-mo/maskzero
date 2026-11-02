import { afterEach, describe, expect, it, vi } from "vitest";

// getPublicEnv caches its result, so each test loads a fresh copy of the module.
const loadGetPublicEnv = async () => (await import("@/lib/env")).getPublicEnv;

describe("getPublicEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("names the variables that are still blank in .env", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const getPublicEnv = await loadGetPublicEnv();
    expect(() => getPublicEnv()).toThrow(
      "Missing or invalid environment variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  });

  it("reads a hosted project and falls back to localhost for a blank app URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    const getPublicEnv = await loadGetPublicEnv();
    expect(getPublicEnv()).toEqual({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      supabasePublishableKey: "sb_publishable_test",
      appUrl: "http://localhost:3000",
      googleAuthEnabled: false,
    });
  });
});
