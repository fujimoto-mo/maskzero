import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ClientsView } from "@/features/clients/components/clients-view";
import { listClients } from "@/features/clients/queries";
import { isAdmin, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "取引先" };

export default async function ClientsPage({ params }: PageProps<"/app/[org]/[client]/clients">) {
  const { org, client } = await params;
  const ctx = await requireMember(org, client);
  // In-house companies never see the client concept (docs/02 M1-1).
  if (ctx.orgKind !== "agency" || !isAdmin(ctx)) notFound();
  const [t, rows] = await Promise.all([getTranslations("Clients"), listClients(ctx)]);

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <ClientsView target={{ orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug }} rows={rows} />
    </div>
  );
}
