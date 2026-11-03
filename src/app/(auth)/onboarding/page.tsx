import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";
import { getHomePath, requireUser } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "会社を登録する" };

export default async function OnboardingPage() {
  const user = await requireUser();
  // A /demo user only ever has their sandbox.
  if (user.demo) redirect("/demo");
  const home = await getHomePath(user);
  if (home) redirect(home);

  const t = await getTranslations();
  return (
    <AuthCard title={t("Onboarding.title")} description={t("Onboarding.description")}>
      <OnboardingForm />
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="truncate">{user.email}</span>
        <SignOutButton label={t("Common.logOut")} />
      </div>
    </AuthCard>
  );
}
