import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { GoogleSignIn } from "@/features/auth/components/google-sign-in";
import { LoginForm } from "@/features/auth/components/login-form";
import { getPublicEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getSessionUser } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next: nextParam, error } = await searchParams;
  const next = safeRedirectPath(nextParam);
  if (await getSessionUser()) redirect(next);

  const t = await getTranslations("Auth");
  const initialError =
    error === "link"
      ? t("errors.linkExpired")
      : error === "oauth"
        ? t("errors.generic")
        : undefined;

  return (
    <AuthCard title={t("login.title")} description={t("login.description")}>
      {getPublicEnv().googleAuthEnabled ? (
        <GoogleSignIn next={next} label={t("login.google")} or={t("login.or")} />
      ) : null}
      <LoginForm next={next} initialError={initialError} />
      <div className="flex flex-col gap-2 text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("login.forgot")}
        </Link>
        <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
          {t("login.noAccount")}
        </Link>
      </div>
    </AuthCard>
  );
}
