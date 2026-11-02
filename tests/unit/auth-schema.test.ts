import { describe, expect, it } from "vitest";
import { authErrorKey, firstErrorKey, signInSchema, signUpSchema } from "@/features/auth/schema";

describe("signUpSchema", () => {
  it("accepts an email with an 8+ character password", () => {
    expect(
      signUpSchema.safeParse({ email: "hr@example.co.jp", password: "12345678" }).success,
    ).toBe(true);
  });

  it("reports an invalid email", () => {
    const result = signUpSchema.safeParse({ email: "hr@", password: "12345678" });
    expect(result.success || firstErrorKey(result.error)).toBe("invalidEmail");
  });

  it("reports a password under 8 characters", () => {
    const result = signUpSchema.safeParse({ email: "hr@example.co.jp", password: "1234567" });
    expect(result.success || firstErrorKey(result.error)).toBe("passwordTooShort");
  });
});

describe("signInSchema", () => {
  it("does not apply the sign-up length rule to existing passwords", () => {
    expect(signInSchema.safeParse({ email: "hr@example.co.jp", password: "short" }).success).toBe(
      true,
    );
  });
});

describe("authErrorKey", () => {
  it.each([
    ["invalid_credentials", "invalidCredentials"],
    ["email_not_confirmed", "emailNotConfirmed"],
    ["user_already_exists", "userExists"],
    ["weak_password", "passwordTooShort"],
    ["over_email_send_rate_limit", "rateLimited"],
    ["otp_expired", "linkExpired"],
    ["some_future_code", "generic"],
    [undefined, "generic"],
  ])("maps %s to %s", (code, key) => {
    expect(authErrorKey(code)).toBe(key);
  });
});
