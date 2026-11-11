import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { pillTab } from "@/components/pill-tab";
import {
  EvaluationTab,
  Interviewers,
  PrepTab,
  ReportTab,
} from "@/features/interviews/components/workspace-view";
import { getWorkspace } from "@/features/interviews/workspace";
import { formatSlot } from "@/features/scheduling/slots";
import { isUuid } from "@/lib/utils";
import { canEdit, requireMember } from "@/server/auth/session";
import { TOOL_LABELS } from "@/server/messaging/send";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")
// AI question suggestions run inside a Server Action on this page.
export const maxDuration = 120;

export const metadata: Metadata = { title: "面接" };

const TABS = ["prep", "evaluation", "report"] as const;
type Tab = (typeof TABS)[number];

/** The interview workspace (docs/02 M11-2 – M11-6). */
export default async function InterviewPage({
  params,
  searchParams,
}: PageProps<"/app/[org]/[client]/meetings/[interviewId]">) {
  const [{ org, client, interviewId }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireMember(org, client);
  if (!isUuid(interviewId)) notFound();
  const editor = canEdit(ctx);
  const workspace = await getWorkspace(ctx, interviewId, editor);
  if (!workspace) notFound();
  const t = await getTranslations("Workspace");
  const tab: Tab = TABS.find((x) => x === query.tab) ?? "prep";
  const base = `/app/${ctx.orgSlug}/${ctx.clientSlug}`;
  const { interview } = workspace;
  const canWork = editor || interview.mine;
  const target = { orgSlug: ctx.orgSlug, clientSlug: ctx.clientSlug, interviewId };

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div className="grid gap-2 print:hidden">
        <Link
          href={`${base}/meetings?d=${new Date(Date.parse(interview.startsAt) + 9 * 3600_000).toISOString().slice(0, 10)}`}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{interview.candidateName}</h1>
          <Badge variant="outline">{t(`status.${interview.status}`)}</Badge>
          {editor ? (
            <Link
              href={`${base}/candidates?app=${interview.applicationId}`}
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              {t("candidate")}
            </Link>
          ) : null}
        </div>
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
        {interview.status === "scheduled" && interview.tool !== "onsite" ? (
          <Link
            href={`${base}/meetings/${interviewId}/live`}
            className="justify-self-start text-sm text-primary underline-offset-4 hover:underline"
          >
            {t("live.open")}
          </Link>
        ) : null}
        <Interviewers
          target={target}
          names={interview.interviewers}
          ids={interview.interviewerIds}
          members={workspace.members}
        />
        {workspace.recordsInterviews && !interview.recordingAllowed ? (
          <p className="text-sm text-destructive">{t("recordingDeclined")}</p>
        ) : null}
      </div>

      <nav aria-label={t("tabs")} className="flex gap-2 print:hidden">
        {TABS.map((item) => (
          <Link
            key={item}
            href={`${base}/meetings/${interviewId}?tab=${item}`}
            aria-current={item === tab ? "page" : undefined}
            className={pillTab(item === tab)}
          >
            {t(`tabNames.${item}`)}
          </Link>
        ))}
      </nav>
      <h2 className="hidden text-lg font-bold print:block">
        {interview.candidateName}・{interview.jobTitle}・{t("round", { round: interview.round })}
      </h2>

      {tab === "prep" ? (
        <PrepTab
          // New suggestions (new ids) start the editor afresh; saving keeps it as is.
          key={workspace.questions.items.map((x) => x.id).join(",")}
          target={target}
          workspace={workspace}
          canEditPurpose={editor}
          canWork={canWork}
        />
      ) : null}
      {tab === "evaluation" ? (
        <EvaluationTab
          target={target}
          workspace={workspace}
          selfId={ctx.userId}
          canEvaluate={canWork}
          canDecide={editor}
        />
      ) : null}
      {tab === "report" ? (
        <ReportTab target={target} workspace={workspace} canWork={canWork} />
      ) : null}
    </div>
  );
}
