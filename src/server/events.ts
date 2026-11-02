import "server-only";
import type { Db, Tx } from "@/server/db/client";
import { events } from "@/server/db/schema";

export type EventInput = {
  orgId: string;
  clientId?: string | null;
  applicationId?: string | null;
  actor: "candidate" | "system" | "staff";
  actorId?: string | null;
  type: string;
  /** IDs and non-personal values only: events outlive the retention purge. */
  payload?: Record<string, unknown>;
};

/** The only writer of the append-only `events` table (docs/04 §5). Call it inside the write's transaction. */
export async function recordEvent(db: Db | Tx, event: EventInput): Promise<void> {
  await db.insert(events).values({
    orgId: event.orgId,
    clientId: event.clientId ?? null,
    applicationId: event.applicationId ?? null,
    actor: event.actor,
    actorId: event.actorId ?? null,
    type: event.type,
    payload: event.payload ?? {},
  });
}
