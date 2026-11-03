import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PoolView } from "@/features/pool/components/pool-view";
import { listPool } from "@/features/pool/queries";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "人材プール" };

export default async function PoolPage({ params }: PageProps<"/app/[org]/[client]/pool">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  // Suggesting other clients' jobs is an agency's work (docs/02 M5-6).
  if (ctx.orgKind !== "agency" || !canEdit(ctx)) notFound();
  const [t, data] = await Promise.all([getTranslations("Pool"), listPool(ctx)]);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <PoolView target={{ orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug }} {...data} />
    </div>
  );
}
