import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { WaitingList } from "@/features/inbound/components/waiting-list";
import { listWaits } from "@/features/inbound/queries";
import { canEdit, isAdmin, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "未エントリー" };

export default async function WaitingPage({
  params,
}: PageProps<"/app/[org]/[client]/screening/waiting">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  const [t, data] = await Promise.all([getTranslations("Waiting"), listWaits(ctx)]);
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="grid gap-1">
        <Link
          href={`${base}/screening`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("back")}
        </Link>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <WaitingList
        target={{ orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug }}
        rows={data.rows}
        nudgeTemplate={data.nudgeTemplate}
        canEdit={canEdit(ctx)}
        canEditTemplate={isAdmin(ctx)}
      />
    </div>
  );
}
