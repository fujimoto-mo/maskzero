import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("safeRedirectPath", () => {
  it.each([
    ["/app", "/app"],
    ["/onboarding", "/onboarding"],
    ["/app/demo/main/dashboard?tab=1#top", "/app/demo/main/dashboard?tab=1#top"],
  ])("keeps the same-site path %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "app",
    "",
    undefined,
    ["/app"],
  ])("falls back for %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/app");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath(null, "/login")).toBe("/login");
  });
});
