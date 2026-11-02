import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CriteriaEditor } from "@/features/screening/components/criteria-editor";
import { getCriteriaSetup } from "@/features/screening/queries";
import { isUuid } from "@/lib/utils";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "選考条件" };

export default async function CriteriaPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/screening/criteria">) {
  const [{ org, client }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  if (typeof query.job !== "string" || !isUuid(query.job)) notFound();
  const [t, setup] = await Promise.all([
    getTranslations("Criteria"),
    getCriteriaSetup(ctx, query.job),
  ]);
  const back = `/app/${ctx.orgSlug}/${ctx.clientSlug}/screening?job=${setup.jobId}`;

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div className="flex items-start gap-3">
        <Button asChild variant="ghost" size="icon" aria-label={t("back")}>
          <Link href={back}>
            <ArrowLeftIcon aria-hidden />
          </Link>
        </Button>
        <div className="grid gap-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("description", { job: setup.jobTitle })}
          </p>
          {setup.openApplications > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("rescreenNote", { count: setup.openApplications })}
            </p>
          ) : null}
        </div>
      </div>
      <CriteriaEditor
        key={setup.version}
        orgSlug={ctx.orgSlug}
        clientSlug={ctx.clientSlug}
        setup={setup}
        canEdit={canEdit(ctx)}
      />
    </div>
  );
}
