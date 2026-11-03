import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAiSession } from "@/features/ai-interview/candidate-server";
import { AiInterviewChat } from "@/features/ai-interview/components/ai-interview-chat";
import { formatDeadline } from "@/features/ai-interview/domain";
import { loadPortal } from "@/features/intake/entry-server";

export const instant = false; // per-request: the token is the only key to this page

export const metadata: Metadata = { title: "AI面接", referrer: "no-referrer" };

/** The AI interview, taken from the personal page before its deadline (docs/02 M12-2). */
export default async function AiInterviewPage({ params }: PageProps<"/p/[token]/ai-interview">) {
  const { token } = await params;
  await connection();
  const portal = await loadPortal(token);
  if (!portal) notFound();
  const [t, session] = await Promise.all([
    getTranslations("AiInterview"),
    loadAiSession(portal.scope, new Date()),
  ]);

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("none")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/p/${token}`}>{t("back")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <AiInterviewChat
      token={token}
      company={portal.view.company}
      deadline={formatDeadline(new Date(session.deadlineAt))}
      initial={session}
    />
  );
}
