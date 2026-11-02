import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

// Placeholder until the Phase 1 landing page (docs/02 M0).
export default async function HomePage() {
  const t = await getTranslations("Home");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <Wordmark className="text-3xl" />
      <div className="space-y-4">
        <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
        <h1 className="text-3xl leading-tight font-bold sm:text-4xl">{t("headline")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/login">{t("toLogin")}</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/signup">{t("toSignup")}</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
    </main>
  );
}
