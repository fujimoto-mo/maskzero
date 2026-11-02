import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { GoogleSignIn } from "@/features/auth/components/google-sign-in";
import { SignupForm } from "@/features/auth/components/signup-form";
import { getPublicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "新規登録" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  // An invitation link sends people here with ?next=/invite/… so they join instead of onboarding.
  const next = safeRedirectPath((await searchParams).next, "/onboarding");
  if (await getSessionUser()) redirect(next === "/onboarding" ? "/app" : next);
  const t = await getTranslations("Auth");

  return (
    <AuthCard title={t("signup.title")} description={t("signup.description")}>
      {getPublicEnv().googleAuthEnabled ? (
        <GoogleSignIn
          next={next === "/onboarding" ? "/app" : next}
          label={t("login.google")}
          or={t("login.or")}
        />
      ) : null}
      <SignupForm next={next} />
      <Link
        href={next === "/onboarding" ? "/login" : `/login?next=${encodeURIComponent(next)}`}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("signup.haveAccount")}
      </Link>
    </AuthCard>
  );
}
