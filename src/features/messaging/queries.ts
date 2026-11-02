import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DEFAULT_TEMPLATES, TRIGGERS, type Trigger } from "@/features/scheduling/templates";
import type { MemberCtx } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import {
  applications,
  candidates,
  messages,
  messageTemplates,
  organizations,
} from "@/server/db/schema";

export type TemplateSetting = {
  trigger: Trigger;
  enabled: boolean;
  subject: string;
  body: string;
  /** False while the shipped default is in use. */
  custom: boolean;
};

/** The company's email templates (shipped defaults where none is saved) and its test mode. */
export async function getMessageSettings(
  ctx: MemberCtx,
): Promise<{ testMode: boolean; templates: TemplateSetting[] }> {
  return withRls(ctx, async (tx) => {
    const [[org], rows] = await Promise.all([
      tx
        .select({ testMode: organizations.testMode })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId)),
      tx
        .select()
        .from(messageTemplates)
        .where(and(eq(messageTemplates.orgId, ctx.orgId), isNull(messageTemplates.clientId))),
    ]);
    return {
      testMode: org?.testMode ?? false,
      templates: TRIGGERS.map((trigger) => {
        const row = rows.find((r) => r.trigger === trigger);
        return row
          ? { trigger, enabled: row.enabled, subject: row.subject, body: row.body, custom: true }
          : { trigger, enabled: true, ...DEFAULT_TEMPLATES[trigger], custom: false };
      }),
    };
  });
}

export type MessageLogRow = {
  id: string;
  applicationId: string;
  candidateName: string;
  trigger: Trigger;
  subject: string;
  status: (typeof messages.$inferSelect)["status"];
  at: string;
  error: string | null;
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
        subject: messages.subject,
        status: messages.status,
        createdAt: messages.createdAt,
        sentAt: messages.sentAt,
        error: messages.error,
      })
      .from(messages)
      .innerJoin(applications, eq(applications.id, messages.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .where(and(eq(messages.orgId, ctx.orgId), eq(messages.clientId, ctx.clientId)))
      .orderBy(desc(messages.createdAt))
      .limit(100),
  );
  return rows.map((r) => ({
    id: r.id,
    applicationId: r.applicationId,
    candidateName: r.candidateName,
    trigger: r.trigger,
    subject: r.subject,
    status: r.status,
    at: (r.sentAt ?? r.createdAt).toISOString(),
    error: r.error,
  }));
}
