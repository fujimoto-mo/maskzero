import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EntryTemplateForm } from "@/features/intake/components/entry-template-form";
import { EntryUrlForm } from "@/features/intake/components/entry-url-form";
import { EntryUrlList } from "@/features/intake/components/entry-url-list";
import { getEntryTemplate, listEntryUrlsByJob } from "@/features/intake/queries";
import { canEdit, isAdmin, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "応募受付URL" };

export default async function EntryUrlsPage({
  params,
}: PageProps<"/app/[org]/[client]/entry-urls">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const [t, jobs, template] = await Promise.all([
    getTranslations("Intake"),
    listEntryUrlsByJob(ctx),
    getEntryTemplate(ctx),
  ]);
  const target = { orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {canEdit(ctx) ? (
        <EntryUrlForm {...target} jobs={jobs.map((job) => ({ id: job.id, title: job.title }))} />
      ) : null}
      <EntryUrlList target={target} jobs={jobs} template={template} canEdit={canEdit(ctx)} />
      <EntryTemplateForm {...target} template={template} canEdit={isAdmin(ctx)} />
    </div>
  );
}
