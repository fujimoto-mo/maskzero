import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CandidateHeader, candidateHeading } from "@/components/candidate-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadAiSession } from "@/features/ai-interview/candidate-server";
import { formatDeadline } from "@/features/ai-interview/domain";
import { PortalUploads } from "@/features/intake/components/portal-uploads";
import { loadCandidateSchedule } from "@/features/interviews/candidate-server";
import { InterviewControls } from "@/features/interviews/components/interview-controls";
import { formatSlot } from "@/features/scheduling/slots";
import { TOOL_LABELS } from "@/server/messaging/send";
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
  const [t, entry, schedule, ai] = await Promise.all([
    getTranslations("Portal"),
    getTranslations("Entry"),
    loadCandidateSchedule(portal.scope, new Date()),
    loadAiSession(portal.scope, new Date()),
  ]);
  const aiOpen =
    schedule.outcome === "active" && (ai?.status === "invited" || ai?.status === "started");
  const interview = schedule.interview;
  const bookable =
    schedule.outcome === "active" &&
    !interview &&
    (schedule.invitation?.status === "sent" || schedule.invitation?.status === "opened");

  return (
    <div className="grid gap-5">
      <CandidateHeader company={view.company} label={view.jobTitle} />
      <div className="grid gap-1.5">
        <p className="text-sm text-muted-foreground">
          {t("applied", { company: view.company, job: view.jobTitle })}
        </p>
        <h1 className={candidateHeading("text-xl")}>
          {t("greeting", { name: view.candidateName })}
        </h1>
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

      {aiOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("aiTitle")}</CardTitle>
            <CardDescription>
              {ai!.status === "started"
                ? t("aiStarted")
                : t("aiInvited", { deadline: formatDeadline(new Date(ai!.deadlineAt)) })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/p/${token}/ai-interview`}>
                {ai!.status === "started" ? t("aiContinue") : t("aiGo")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {interview ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("interviewTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1">
              <dt className="text-muted-foreground">{t("interviewAt")}</dt>
              <dd className="font-medium">
                {formatSlot({
                  startsAt: new Date(interview.startsAt),
                  endsAt: new Date(interview.endsAt),
                })}
              </dd>
              <dt className="text-muted-foreground">{t("method")}</dt>
              <dd>{TOOL_LABELS[interview.tool]}</dd>
              {interview.meetingUrl ? (
                <>
                  <dt className="text-muted-foreground">URL</dt>
                  <dd>
                    <a
                      href={interview.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-primary underline underline-offset-4"
                    >
                      {t("join")}
                    </a>
                  </dd>
                </>
              ) : interview.location ? (
                <>
                  <dt className="text-muted-foreground">{t("place")}</dt>
                  <dd>{interview.location}</dd>
                </>
              ) : null}
            </dl>
            <p className="text-xs text-muted-foreground">
              {interview.changeableUntil
                ? t("changeUntil", {
                    date: formatSlot({
                      startsAt: new Date(interview.changeableUntil),
                      endsAt: new Date(interview.changeableUntil),
                    }).replace(/〜.*$/, ""),
                  })
                : t("tooLate")}
            </p>
            <InterviewControls token={token} canReschedule={Boolean(interview.changeableUntil)} />
          </CardContent>
        </Card>
      ) : bookable ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("interviewTitle")}</CardTitle>
            <CardDescription>
              {schedule.request === "pending" ? t("awaitingConfirmation") : t("bookLead")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/p/${token}/book`}>{t("book")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

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

      <Link
        href={`/p/${token}/consent`}
        className="justify-self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        {t("consentLink")}
      </Link>
    </div>
  );
}
