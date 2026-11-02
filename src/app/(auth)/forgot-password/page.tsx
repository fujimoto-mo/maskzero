import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "パスワードの再設定" };

export default async function ForgotPasswordPage() {
  const t = await getTranslations();

  return (
    <AuthCard title={t("Auth.forgot.title")} description={t("Auth.forgot.description")}>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm text-primary underline-offset-4 hover:underline">
        {t("Common.logIn")}
      </Link>
    </AuthCard>
  );
}
