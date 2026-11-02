import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { FormAlert } from "@/components/form-alert";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { acceptInvitationAction } from "@/features/settings/invite-actions";
import { findInvitation } from "@/features/settings/invite";
import { getSessionUser } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = {
  title: "招待",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitePage({ params, searchParams }: PageProps<"/invite/[token]">) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const [t, common, user, invitation] = await Promise.all([
    getTranslations("Invite"),
    getTranslations("Common"),
    getSessionUser(),
    findInvitation(token),
  ]);

  if (!invitation) {
    return (
      <AuthCard title={t("title", { org: "mask0" })}>
        <FormAlert error={t("invalid")} />
      </AuthCard>
    );
  }

  const next = encodeURIComponent(`/invite/${token}`);
  const title = t("title", { org: invitation.orgName });
  if (!user) {
    return (
      <AuthCard title={title} description={t("description", { org: invitation.orgName })}>
        <p className="text-sm">{t("needLogin")}</p>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/login?next=${next}`}>{t("login")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/signup?next=${next}`}>{t("signup")}</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <AuthCard title={title}>
        <FormAlert error={t("wrongEmail")} />
        <p className="text-sm text-muted-foreground">{t("signedInAs", { email: user.email })}</p>
        <SignOutButton label={common("logOut")} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={title} description={t("description", { org: invitation.orgName })}>
      {query.error ? <FormAlert error={t("invalid")} /> : null}
      <p className="text-sm text-muted-foreground">{t("signedInAs", { email: user.email })}</p>
      <form action={acceptInvitationAction.bind(null, token)}>
        <SubmitButton className="w-full">{t("accept")}</SubmitButton>
      </form>
    </AuthCard>
  );
}
