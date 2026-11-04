import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  type Anchor,
  DEFAULT_TEMPLATES,
  DEFAULT_TIMING,
  type LoggedTrigger,
  type Timing,
  TRIGGERS,
  type Trigger,
} from "@/features/scheduling/templates";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import {
  applications,
  candidates,
  customMessages,
  messages,
  messageTemplates,
  organizations,
} from "@/server/db/schema";

/** Whose wording: the company default, or the current client's own (agencies, M9-3). */
export type TemplateScope = "org" | "client";

export type TemplateSetting = {
  trigger: Trigger;
  enabled: boolean;
  /** null for triggers with a fixed send time. */
  timing: Timing | null;
  subject: string;
  body: string;
  /** False while the inherited wording (company default, or ours) is in use. */
  custom: boolean;
};

export type CustomMessageSetting = {
  id: string;
  name: string;
  anchor: Anchor;
  timing: Timing;
  enabled: boolean;
  subject: string;
  body: string;
  /** null = every client of the company. */
  clientId: string | null;
};

/**
 * The templates for one scope: company defaults (ours where none is saved), or the current
 * client's overrides falling back to the company's. Plus custom emails and test mode.
 */
export async function getMessageSettings(
  ctx: MemberCtx,
  scope: TemplateScope,
): Promise<{
  testMode: boolean;
  templates: TemplateSetting[];
  customMessages: CustomMessageSetting[];
}> {
  return withRls(ctx, async (tx) => {
    const [[org], rows, customs] = await Promise.all([
      tx
        .select({ testMode: organizations.testMode })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId)),
      tx
        .select()
        .from(messageTemplates)
        .where(
          and(
            eq(messageTemplates.orgId, ctx.orgId),
            or(isNull(messageTemplates.clientId), eq(messageTemplates.clientId, ctx.clientId)),
          ),
        ),
      tx
        .select()
        .from(customMessages)
        .where(
          and(
            eq(customMessages.orgId, ctx.orgId),
            scope === "org"
              ? isNull(customMessages.clientId)
              : eq(customMessages.clientId, ctx.clientId),
          ),
        )
        .orderBy(customMessages.createdAt),
    ]);
    return {
      testMode: org?.testMode ?? false,
      templates: TRIGGERS.map((trigger) => {
        const orgRow = rows.find((r) => r.trigger === trigger && !r.clientId);
        const own =
          scope === "org" ? orgRow : rows.find((r) => r.trigger === trigger && r.clientId);
        const inherited = scope === "org" ? undefined : orgRow;
        const base = own ?? inherited;
        const timing = DEFAULT_TIMING[trigger] ? (base?.timing ?? DEFAULT_TIMING[trigger]!) : null;
        return base
          ? {
              trigger,
              enabled: base.enabled,
              timing,
              subject: base.subject,
              body: base.body,
              custom: Boolean(own),
            }
          : { trigger, enabled: true, timing, ...DEFAULT_TEMPLATES[trigger], custom: false };
      }),
      customMessages: customs.map((c) => ({
        id: c.id,
        name: c.name,
        anchor: c.anchor,
        timing: c.timing,
        enabled: c.enabled,
        subject: c.subject,
        body: c.body,
        clientId: c.clientId,
      })),
    };
  });
}

export type MessageLogRow = {
  id: string;
  applicationId: string;
  candidateName: string;
  trigger: LoggedTrigger;
  /** The custom email's name, for trigger "custom". */
  customName: string | null;
  subject: string;
  status: (typeof messages.$inferSelect)["status"];
  at: string;
  error: string | null;
  /** Sent from the company's Gmail rather than mask0's sender (M9-4). */
  viaGmail: boolean;
};

/** The client's send log, newest first (docs/02 M9-5). */
export async function listMessages(ctx: MemberCtx): Promise<MessageLogRow[]> {
  const rows = await withRls(ctx, (tx) =>
    tx
      .select({
        id: messages.id,
        applicationId: messages.applicationId,
        candidateName: candidates.name,
        trigger: messages.trigger,
        customName: customMessages.name,
        subject: messages.subject,
        status: messages.status,
        createdAt: messages.createdAt,
        sentAt: messages.sentAt,
        error: messages.error,
        sentVia: messages.sentVia,
      })
      .from(messages)
      .innerJoin(applications, eq(applications.id, messages.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .leftJoin(customMessages, eq(customMessages.id, messages.customMessageId))
      .where(and(eq(messages.orgId, ctx.orgId), eq(messages.clientId, ctx.clientId)))
      .orderBy(desc(messages.createdAt))
      .limit(100),
  );
  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    candidateName: r.candidateName,
    trigger: r.trigger,
    customName: r.customName,
    subject: r.subject,
    status: r.status,
    at: (r.sentAt ?? r.createdAt).toISOString(),
    error: r.error,
    viaGmail: r.sentVia === "gmail",
  }));
}
