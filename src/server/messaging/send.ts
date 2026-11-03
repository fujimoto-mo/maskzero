import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { postingFieldsSchema } from "@/features/jobs/schema";
import { buildIcs } from "@/features/scheduling/ics";
import { formatSlot } from "@/features/scheduling/slots";
import {
  DEFAULT_TEMPLATES,
  type LoggedTrigger,
  type MergeValues,
  renderConcerns,
  renderTemplate,
  type Template,
} from "@/features/scheduling/templates";
import { decryptOptional } from "@/server/crypto/pii";
import { getAdminDb } from "@/server/db/admin";
import {
  applications,
  bookingRequests,
  candidates,
  clients,
  concernOptions,
  customMessages,
  interviews,
  jobs,
  messages,
  messageTemplates,
  organizations,
} from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { recordEvent } from "@/server/events";
import { inboundAddress } from "@/server/inbound/address";
import { bookingUrl, consentUrl, portalTokenFor, portalUrl } from "@/server/portal";

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
  /** "custom" needs customMessageId. */
  trigger: LoggedTrigger;
  dedupeKey: string;
  interviewId?: string;
  customMessageId?: string;
  /** Values that differ from the application's own, such as a suggested job. */
  overrides?: MergeValues;
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
      inboundLocalPart: organizations.inboundLocalPart,
      recordsInterviews: organizations.recordsInterviews,
      testMode: organizations.testMode,
      demoExpiresAt: organizations.demoExpiresAt,
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

  const template = await templateFor(input, app.clientId);
  if (!template) return "disabled";

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
    upload_url: portalUrl(token),
    consent_url: consentUrl(token),
    // Told before the interview, with a way to decline (docs/02 M11-5).
    recording_notice: app.recordsInterviews
      ? `面接の内容は、評価のために録画・文字起こしすることがあります。ご希望でない場合は、下記のページからお知らせください。\n${consentUrl(token)}`
      : "",
  };
  let interview: typeof interviews.$inferSelect | undefined;
  if (input.interviewId) {
    [interview] = await db.select().from(interviews).where(eq(interviews.id, input.interviewId));
    if (interview) {
      values.interview_at = formatSlot(interview);
      values.tool = TOOL_LABELS[interview.tool] ?? "";
      values.meeting_url = interview.meetingUrl ?? interview.location ?? "";
      values.concerns = await concernsFor(interview.invitationId);
    }
  }
  Object.assign(values, input.overrides);
  const { subject, body } = renderTemplate(template, values);

  const [row] = await db
    .insert(messages)
    .values({
      orgId: input.orgId,
      clientId: app.clientId,
      applicationId: input.applicationId,
      trigger: input.trigger,
      customMessageId: input.customMessageId ?? null,
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

  // A /demo sandbox never emails candidates, whatever its test-mode setting says.
  if (app.testMode || app.demoExpiresAt) {
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
      // The company's own address if set; otherwise replies reach mask0's inbox (M9-4).
      replyTo: app.replyTo || inboundAddress(app.inboundLocalPart),
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

/**
 * The wording to send: a custom email by id, or for a trigger the client's own wording, then the
 * company default, then ours. Null when the company switched the email off.
 */
async function templateFor(
  input: { orgId: string; trigger: LoggedTrigger; customMessageId?: string },
  clientId: string,
): Promise<Template | null> {
  const db = getAdminDb();
  if (input.trigger === "custom") {
    if (!input.customMessageId) return null;
    const [row] = await db
      .select()
      .from(customMessages)
      .where(
        and(
          eq(customMessages.id, input.customMessageId),
          eq(customMessages.orgId, input.orgId),
          or(isNull(customMessages.clientId), eq(customMessages.clientId, clientId)),
        ),
      );
    return row?.enabled ? row : null;
  }
  const rows = await db
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.orgId, input.orgId),
        eq(messageTemplates.trigger, input.trigger),
        or(isNull(messageTemplates.clientId), eq(messageTemplates.clientId, clientId)),
      ),
    );
  const chosen = rows.find((t) => t.clientId === clientId) ?? rows.find((t) => !t.clientId);
  if (chosen && !chosen.enabled) return null;
  return chosen ?? DEFAULT_TEMPLATES[input.trigger];
}

/** The concerns the candidate picked when booking, with the company's answers (M9-2). */
async function concernsFor(invitationId: string | null): Promise<string> {
  if (!invitationId) return "";
  const db = getAdminDb();
  const [request] = await db
    .select({ ids: bookingRequests.concernIds })
    .from(bookingRequests)
    .where(
      and(eq(bookingRequests.invitationId, invitationId), eq(bookingRequests.status, "confirmed")),
    )
    .limit(1);
  if (!request?.ids?.length) return "";
  const rows = await db
    .select({ label: concernOptions.label, answer: concernOptions.answer })
    .from(concernOptions)
    .where(inArray(concernOptions.id, request.ids))
    .orderBy(concernOptions.position);
  return renderConcerns(rows);
}
