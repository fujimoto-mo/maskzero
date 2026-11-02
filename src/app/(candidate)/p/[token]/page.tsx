import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PortalUploads } from "@/features/intake/components/portal-uploads";
import { loadPortal } from "@/features/intake/entry-server";

export const instant = false; // per-request: the token is the only key to this page

export const metadata: Metadata = { title: "応募状況", referrer: "no-referrer" };

const dateFormat = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

export default async function PortalPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  await connection();
  const portal = await loadPortal(token);
  if (!portal) notFound();
  const { view } = portal;
  const [t, entry] = await Promise.all([getTranslations("Portal"), getTranslations("Entry")]);

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          {t("applied", { company: view.company, job: view.jobTitle })}
        </p>
        <h1 className="text-xl font-bold">{t("greeting", { name: view.candidateName })}</h1>
        {view.agency ? (
          <p className="text-xs text-muted-foreground">
            {t("agencyNote", { agency: view.agency })}
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardDescription>{t("statusTitle")}</CardDescription>
          <CardTitle>{t(`status.${view.status}`)}</CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("documentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {view.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDocuments")}</p>
          ) : (
            <ul className="grid gap-2">
              {view.documents.map((doc) => (
                <li key={doc.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">
                    {doc.kind === "cv" ? entry("documents.cv") : entry("documents.resume")}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate">{doc.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {doc.ready ? t("received") : t("checking")} ·{" "}
                    {dateFormat.format(new Date(doc.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("addTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {view.uploadsAllowed ? (
            <PortalUploads token={token} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("uploadsClosed")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
