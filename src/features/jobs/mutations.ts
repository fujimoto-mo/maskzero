import "server-only";
import { randomUUID } from "node:crypto";
import type { Tx } from "@/server/db/client";
import { jobs, screeningCriteria, screeningSettings } from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { SAMPLE_CRITERIA, SAMPLE_JOB_FIELDS } from "./sample";
import type { PostingFields } from "./schema";

/** Today's date in Japan, which posting periods are written in. */
export const japanToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

type Owner = { orgId: string; clientId: string; userId: string };

/** Creates a job with default screening settings. Call inside withRls(). */
export async function insertJob(
  tx: Tx,
  owner: Owner,
  fields: PostingFields,
  options: { requiresCv?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  await tx.insert(jobs).values({
    id,
    orgId: owner.orgId,
    clientId: owner.clientId,
    title: fields.title ?? "",
    postingFields: fields,
    postingFrom: japanToday(),
    requiresCv: options.requiresCv ?? false,
    createdBy: owner.userId,
  });
  await tx
    .insert(screeningSettings)
    .values({ jobId: id, orgId: owner.orgId, clientId: owner.clientId });
  await recordEvent(tx, {
    orgId: owner.orgId,
    clientId: owner.clientId,
    // Users may only append their own staff events (RLS); the sample job counts as the owner's.
    actor: "staff",
    actorId: owner.userId,
    type: "job.created",
    payload: { jobId: id },
  });
  return id;
}

/** The sample job and its screening conditions every new company starts with (docs/02 M1-2). */
export async function insertSampleJob(tx: Tx, owner: Owner): Promise<string> {
  const id = await insertJob(tx, owner, SAMPLE_JOB_FIELDS);
  await tx.insert(screeningCriteria).values(
    SAMPLE_CRITERIA.map((c, position) => ({
      orgId: owner.orgId,
      clientId: owner.clientId,
      jobId: id,
      type: c.type,
      label: c.label,
      kind: c.kind,
      source: c.source,
      config: c.config,
      position,
    })),
  );
  return id;
}
