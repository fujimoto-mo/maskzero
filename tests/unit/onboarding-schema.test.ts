import { describe, expect, it } from "vitest";
import { onboardingSchema } from "@/features/onboarding/schema";

describe("onboardingSchema", () => {
  it("trims the company name", () => {
    const result = onboardingSchema.parse({ companyName: "  株式会社テスト  ", kind: "agency" });
    expect(result).toEqual({ companyName: "株式会社テスト", kind: "agency" });
  });

  it.each([
    ["   ", "nameRequired"],
    ["あ".repeat(101), "nameTooLong"],
  ])("rejects %j with %s", (companyName, key) => {
    const result = onboardingSchema.safeParse({ companyName, kind: "inhouse" });
    expect(result.success || result.error.issues[0]?.message).toBe(key);
  });

  it("rejects an unknown kind", () => {
    expect(
      onboardingSchema.safeParse({ companyName: "株式会社テスト", kind: "other" }).success,
    ).toBe(false);
  });
});
