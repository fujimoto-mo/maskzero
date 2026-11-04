import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveAssistView } from "@/features/interviews/components/live-view";
import { getBookingConcerns, getLiveView } from "@/features/interviews/live-server";
import { getWorkspace } from "@/features/interviews/workspace";
import { formatSlot } from "@/features/scheduling/slots";
import { isUuid } from "@/lib/utils";
import { requireMember } from "@/server/auth/session";
import { meetingBotAvailable } from "@/server/integrations/config";
import { TOOL_LABELS } from "@/server/messaging/send";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "面接ライブ" };

/** The interviewer's companion during an online interview (docs/02 M11-5, M11-7). */
export default async function LiveInterviewPage({
  params,
}: PageProps<"/app/[org]/[client]/meetings/[interviewId]/live">) {
  const { org, client, interviewId } = await params;
  const ctx = await requireMember(org, client);
  if (!isUuid(interviewId)) notFound();
  const [workspace, live, concerns] = await Promise.all([
    getWorkspace(ctx, interviewId, false),
    getLiveView(ctx, interviewId, null),
    getBookingConcerns(ctx, interviewId),
  ]);
  if (!workspace || !live) notFound();
  const t = await getTranslations("Workspace");
  const { interview } = workspace;
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;
  const prepared = workspace.questions.items.filter((q) => q.picked);
  const blocked =
    interview.tool === "onsite"
      ? t("live.notOnline")
      : !interview.recordingAllowed
        ? t("live.declined")
        : !workspace.recordsInterviews || !meetingBotAvailable()
          ? t("live.off")
          : null;

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="grid gap-2">
        <Link
          href={`${base}/meetings/${interviewId}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("live.back")}
        </Link>
        <h1 className="text-2xl font-bold">
          {t("live.title")}：{interview.candidateName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {interview.jobTitle}・{t("round", { round: interview.round })}・
          {formatSlot({
            startsAt: new Date(interview.startsAt),
            endsAt: new Date(interview.endsAt),
          })}
          ・{TOOL_LABELS[interview.tool] ?? interview.tool}
          {interview.meetingUrl && interview.status === "scheduled" ? (
            <>
              ・
              <a
                href={interview.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {t("join")}
              </a>
            </>
          ) : null}
        </p>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("live.hint")}</p>
        {blocked ? <p className="text-sm text-destructive">{blocked}</p> : null}
      </div>

      {blocked && live.segments.length === 0 ? null : (
        <LiveAssistView
          target={{ orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug, interviewId }}
          initial={live}
        />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("live.prepared")}</CardTitle>
          </CardHeader>
          <CardContent>
            {prepared.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("live.noPrepared")}</p>
            ) : (
              <ol className="grid list-decimal gap-2 pl-5 text-sm">
                {prepared.map((q) => (
                  <li key={q.id}>{q.text}</li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("live.concerns")}</CardTitle>
          </CardHeader>
          <CardContent>
            {concerns.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("live.noConcerns")}</p>
            ) : (
              <ul className="grid list-disc gap-2 pl-5 text-sm">
                {concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
