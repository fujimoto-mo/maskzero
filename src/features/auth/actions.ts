"use server";

import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getPublicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { requireUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server";
import {
  authErrorKey,
  firstErrorKey,
  newPasswordSchema,
  passwordResetRequestSchema,
  signInSchema,
  signUpSchema,
} from "./schema";

export type AuthFormState = {
  error?: string;
  message?: string;
  values?: { email?: string };
};

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations("Auth.errors");
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstErrorKey(parsed.error)), values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: t(authErrorKey(error.code)), values };

  redirect(safeRedirectPath(formData.get("next")));
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations("Auth.errors");
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstErrorKey(parsed.error)), values };

  const next = safeRedirectPath(formData.get("next"), "/onboarding");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${getPublicEnv().appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: t(authErrorKey(error.code)), values };

  // With email confirmation on (the default), there is no session until the link is opened.
  redirect(data.session ? next : "/signup/check-email");
}

export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const next = safeRedirectPath(formData.get("next"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getPublicEnv().appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const t = await getTranslations("Auth");
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = passwordResetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(`errors.${firstErrorKey(parsed.error)}`), values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getPublicEnv().appUrl}/auth/callback?next=/reset-password`,
  });
  if (error && authErrorKey(error.code) === "rateLimited") {
    return { error: t("errors.rateLimited"), values };
  }
  // Same answer whether or not the address has an account, so the form can't probe for accounts.
  return { message: t("forgot.sent") };
}

export async function updatePasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireUser();
  const t = await getTranslations("Auth.errors");
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t(firstErrorKey(parsed.error)) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: t(authErrorKey(error.code)) };

  redirect("/app");
}
