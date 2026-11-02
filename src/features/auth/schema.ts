import { z } from "zod";
import type messages from "@/messages/ja.json";

/** Keys of Auth.errors in src/messages/ja.json; schema error messages are these keys. */
export type AuthErrorKey = keyof (typeof messages)["Auth"]["errors"];

const email = z.email("invalidEmail" satisfies AuthErrorKey);
const newPassword = z.string().min(8, "passwordTooShort" satisfies AuthErrorKey);

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "invalidCredentials" satisfies AuthErrorKey),
});

export const signUpSchema = z.object({ email, password: newPassword });

export const passwordResetRequestSchema = z.object({ email });

export const newPasswordSchema = z.object({ password: newPassword });

/** The first issue's message, which the schemas above set to an AuthErrorKey. */
export function firstErrorKey(error: z.ZodError): AuthErrorKey {
  return (error.issues[0]?.message ?? "generic") as AuthErrorKey;
}

/** Supabase Auth error codes → messages (https://supabase.com/docs/guides/auth/debugging/error-codes). */
export function authErrorKey(code: string | undefined): AuthErrorKey {
  switch (code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "userExists";
    case "weak_password":
      return "passwordTooShort";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
      return "linkExpired";
    default:
      return "generic";
  }
}
