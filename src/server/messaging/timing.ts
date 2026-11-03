import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { DEFAULT_TIMING, type Timing, type Trigger } from "@/features/scheduling/templates";
import { getAdminDb } from "@/server/db/admin";
import { messageTemplates } from "@/server/db/schema";

/** The timing the company chose for a trigger (client wording first), or the default. */
export async function resolveTiming(
  orgId: string,
  clientId: string,
  trigger: Trigger,
): Promise<Timing> {
  const rows = await getAdminDb()
    .select({ clientId: messageTemplates.clientId, timing: messageTemplates.timing })
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.orgId, orgId),
        eq(messageTemplates.trigger, trigger),
        or(isNull(messageTemplates.clientId), eq(messageTemplates.clientId, clientId)),
      ),
    );
  const chosen = rows.find((r) => r.clientId === clientId) ?? rows.find((r) => !r.clientId);
  return chosen?.timing ?? DEFAULT_TIMING[trigger] ?? "immediately";
}
