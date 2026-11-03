import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RepliesView } from "@/features/inbound/components/replies-view";
import { listReplies } from "@/features/inbound/queries";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "応募者からの返信" };

export default async function MessagesPage({ params }: PageProps<"/app/[org]/[client]/messages">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const [t, rows] = await Promise.all([getTranslations("Messages"), listReplies(ctx)]);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <RepliesView
        base={`/app/${ctx.orgSlug}/${ctx.clientSlug}`}
        rows={rows}
        canEdit={canEdit(ctx)}
      />
    </div>
  );
}
