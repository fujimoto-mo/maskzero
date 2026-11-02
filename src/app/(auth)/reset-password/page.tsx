import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { requireUser } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "新しいパスワード" };

// Reached from the reset email: /auth/callback has already turned the link into a session.
export default async function ResetPasswordPage() {
  await requireUser();
  const t = await getTranslations("Auth.reset");

  return (
    <AuthCard title={t("title")} description={t("description")}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
