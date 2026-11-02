import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/features/auth/components/auth-card";

export const metadata: Metadata = { title: "確認メールを送りました" };

export default async function CheckEmailPage() {
  const t = await getTranslations("Auth.checkEmail");

  return (
    <AuthCard title={t("title")} description={t("description")}>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
    </AuthCard>
  );
}
