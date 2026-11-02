import "server-only";
import type { Db, Tx } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

export type AuditInput = {
  orgId: string;
  userId: string | null;
  /** e.g. "settings.entry_template_updated", "candidates.exported". */
  action: string;
  targetType?: string;
  targetId?: string | null;
  /** Non-personal details only. */
  meta?: Record<string, unknown>;
};

/** Appends to audit_logs: who changed settings, exported or deleted data (docs/05 §9). */
export async function recordAudit(db: Db | Tx, entry: AuditInput): Promise<void> {
  await db.insert(auditLogs).values({
    orgId: entry.orgId,
    userId: entry.userId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    meta: entry.meta ?? {},
  });
}
