import "server-only";
import { and, inArray, lt, sql } from "drizzle-orm";
import { getAdminDb } from "@/server/db/admin";
import { applications, candidates, documents } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { removeObjects } from "@/server/storage";

/**
 * Deletes up to `limit` rejected or withdrawn applications whose retention period is over (docs/02
 * M13-2): their files, answers, documents and AI records, and the candidate too when nothing else
 * of theirs remains. Returns how many applications were purged.
 */
export async function purgeExpiredBatch(limit: number): Promise<number> {
  const db = getAdminDb();
  const expired = await db
    .select({
      id: applications.id,
      orgId: applications.orgId,
      candidateId: applications.candidateId,
    })
    .from(applications)
    .where(
      and(
        lt(applications.purgeAfter, sql`now()`),
        inArray(applications.outcome, ["rejected", "withdrawn"]),
      ),
    )
    .limit(limit);
  if (expired.length === 0) return 0;
  const ids = expired.map((a) => a.id);

  // Files first: a row without its file is harmless, a file without its row would never be found.
  const files = await db
    .select({ path: documents.storagePath })
    .from(documents)
    .where(inArray(documents.applicationId, ids));
  await removeObjects(
    "documents",
    files.map((f) => f.path),
  );

  await db.transaction(async (tx) => {
    // Answers, documents, consents and screening records go with the application (FK cascade).
    await tx.delete(applications).where(inArray(applications.id, ids));
    const candidateIds = [...new Set(expired.map((a) => a.candidateId))];
    await tx
      .delete(candidates)
      .where(
        and(
          inArray(candidates.id, candidateIds),
          sql`not exists (select 1 from ${applications} a where a.candidate_id = ${candidates.id})`,
        ),
      );
    const perOrg = new Map<string, number>();
    for (const a of expired) perOrg.set(a.orgId, (perOrg.get(a.orgId) ?? 0) + 1);
    for (const [orgId, count] of perOrg) {
      await recordEvent(tx, {
        orgId,
        actor: "system",
        type: "retention.purged",
        payload: { count },
      });
    }
  });
  return expired.length;
}
