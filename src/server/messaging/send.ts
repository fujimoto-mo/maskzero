import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { postingFieldsSchema } from "@/features/jobs/schema";
import { buildIcs } from "@/features/scheduling/ics";
import { formatSlot } from "@/features/scheduling/slots";
import {
  DEFAULT_TEMPLATES,
  type MergeValues,
  renderTemplate,
  type Trigger,
} from "@/features/scheduling/templates";
import { decryptOptional } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import {
  applications,
  candidates,
  clients,
  interviews,
  jobs,
  messages,
  messageTemplates,
  organizations,
} from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { recordEvent } from "@/server/events";
import { bookingUrl, portalTokenFor, portalUrl } from "@/server/portal";

// Candidate emails (docs/02 M9, docs/05 §10). Called from background jobs, on the admin connection.

export type SendOutcome = "sent" | "dry_run" | "duplicate" | "disabled" | "no_email" | "failed";

export const TOOL_LABELS: Record<string, string> = {
  url: "オンライン（Web会議）",
  onsite: "対面",
  meet: "オンライン（Google Meet）",
  zoom: "オンライン（Zoom）",
  teams: "オンライン（Microsoft Teams）",
};

/**
 * Sends one candidate email. `dedupeKey` (unique in the send log) makes it idempotent: a retried
 * job finds its earlier row and sends nothing. The company's test mode logs `dry_run` instead.
 */
export async function sendCandidateMessage(input: {
  applicationId: string;
  orgId: string;
  trigger: Trigger;
  dedupeKey: string;
  interviewId?: string;
}): Promise<SendOutcome> {
  const db = getAdminDb();
  const [app] = await db
    .select({
      clientId: applications.clientId,
      name: candidates.name,
      emailEnc: candidates.emailEnc,
      postingFields: jobs.postingFields,
      orgName: organizations.name,
      orgKind: organizations.kind,
      senderName: organizations.senderName,
      replyTo: organizations.replyTo,
      testMode: organizations.testMode,
      clientName: clients.name,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(organizations, eq(organizations.id, applications.orgId))
    .innerJoin(clients, eq(clients.id, applications.clientId))
    .where(and(eq(applications.id, input.applicationId), eq(applications.orgId, input.orgId)));
  if (!app) return "failed";
  const email = decryptOptional(app.emailEnc);
  if (!email) return "no_email";

  // A client-specific template wins over the company default, which wins over ours.
  const templates = await db
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.orgId, input.orgId),
        eq(messageTemplates.trigger, input.trigger),
        or(isNull(messageTemplates.clientId), eq(messageTemplates.clientId, app.clientId)),
      ),
    );
  const custom =
    templates.find((t) => t.clientId === app.clientId) ?? templates.find((t) => !t.clientId);
  if (custom && !custom.enabled) return "disabled";

  // An agency recruits for its client: the candidate deals with the client's name.
  const company =
    app.orgKind === "agency" && app.clientName !== app.orgName ? app.clientName : app.orgName;
  const token = await portalTokenFor(db, input.applicationId);
  const values: MergeValues = {
    name: app.name,
    company,
    job: postingFieldsSchema.catch({}).parse(app.postingFields).title ?? "",
    booking_url: bookingUrl(token),
    portal_url: portalUrl(token),
  };
  let interview: typeof interviews.$inferSelect | undefined;
  if (input.interviewId) {
    [interview] = await db.select().from(interviews).where(eq(interviews.id, input.interviewId));
    if (interview) {
      values.interview_at = formatSlot(interview);
      values.tool = TOOL_LABELS[interview.tool] ?? "";
      values.meeting_url = interview.meetingUrl ?? interview.location ?? "";
    }
  }
  const { subject, body } = renderTemplate(custom ?? DEFAULT_TEMPLATES[input.trigger], values);

  const [row] = await db
    .insert(messages)
    .values({
      orgId: input.orgId,
      clientId: app.clientId,
      applicationId: input.applicationId,
      trigger: input.trigger,
      toEmailEnc: app.emailEnc,
      subject,
      bodyRendered: body,
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing({ target: messages.dedupeKey })
    .returning({ id: messages.id });
  if (!row) return "duplicate";

  const log = async (
    status: "sent" | "dry_run" | "failed",
    extra: Partial<typeof messages.$inferInsert> = {},
  ) => {
    await db
      .update(messages)
      .set({ status, ...extra })
      .where(eq(messages.id, row.id));
    await recordEvent(db, {
      orgId: input.orgId,
      clientId: app.clientId,
      applicationId: input.applicationId,
      actor: "system",
      type: `message.${status}`,
      payload: { messageId: row.id, trigger: input.trigger },
    });
  };

  if (app.testMode) {
    await log("dry_run");
    return "dry_run";
  }
  try {
    const ics =
      input.trigger === "confirmed" && interview
        ? buildIcs({
            uid: `${interview.id}@mask0`,
            startsAt: interview.startsAt,
            endsAt: interview.endsAt,
            summary: `面接：${company}（${values.job}）`,
            description: [values.tool, values.meeting_url, values.portal_url]
              .filter(Boolean)
              .join("\n"),
            location: interview.location ?? interview.meetingUrl,
            url: interview.meetingUrl,
            now: new Date(),
          })
        : null;
    const result = await sendEmail({
      to: email,
      subject,
      text: body,
      fromName: `${app.senderName || company} 採用担当`,
      replyTo: app.replyTo,
      attachments: ics
        ? [
            {
              filename: "interview.ics",
              contentType: "text/calendar; charset=utf-8; method=PUBLISH",
              content: Buffer.from(ics).toString("base64"),
            },
          ]
        : undefined,
    });
    await log(result.dryRun ? "dry_run" : "sent", {
      providerMessageId: result.id,
      sentAt: new Date(),
    });
    return result.dryRun ? "dry_run" : "sent";
  } catch (error) {
    await log("failed", { error: error instanceof Error ? error.message.slice(0, 300) : "error" });
    return "failed";
  }
}
