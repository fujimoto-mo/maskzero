import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { normalizeEmail } from "@/lib/contact";
import { encryptPii, hashPii } from "@/server/crypto/pii";
import type { Tx } from "@/server/db/client";
import { getAdminDb } from "@/server/db/admin";
import {
  applications,
  candidates,
  entryWaits,
  inboundEmails,
  jobs,
  organizations,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { localPartOf } from "@/server/inbound/address";
import { nameKey, normalizeAddress, parseNotification, replyText } from "./parse";

// Inbound mail (docs/02 M3-10): candidate replies go to the timeline and the messages page;
// job-board notifications become "not yet entered" records. Admin connection: there is no staff
// session, and the org comes from the recipient address only.

const MAX_BODY = 20_000;

export type InboundMessage = {
  to: string[];
  from: string;
  subject: string;
  text: string;
};

export type IngestResult =
  | { kind: "unknown_recipient" }
  | { kind: "candidate_reply"; orgId: string; applicationId: string }
  | { kind: "job_board"; orgId: string; waitId: string | null }
  | { kind: "other"; orgId: string };

async function orgForRecipients(to: string[]) {
  for (const address of to) {
    const local = localPartOf(address);
    if (!local) continue;
    const [org] = await getAdminDb()
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.inboundLocalPart, local));
    if (org) return org.id;
  }
  return null;
}

export async function ingestInboundEmail(message: InboundMessage): Promise<IngestResult> {
  const orgId = await orgForRecipients(message.to);
  if (!orgId) return { kind: "unknown_recipient" };
  const db = getAdminDb();
  const from = normalizeAddress(message.from.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? message.from);
  const fromHash = hashPii("email", normalizeEmail(from));
  const subject = message.subject.slice(0, 300);
  const text = message.text.slice(0, MAX_BODY);
  const sealed = {
    fromHash,
    fromEnc: encryptPii(from),
    subjectEnc: encryptPii(subject),
  };

  // A candidate of this company: a reply, attached to their latest application.
  const [application] = await db
    .select({ id: applications.id, clientId: applications.clientId })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(and(eq(candidates.orgId, orgId), eq(candidates.emailHash, fromHash)))
    .orderBy(sql`${applications.outcome} = 'active' desc`, desc(applications.appliedAt))
    .limit(1);
  if (application) {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(inboundEmails)
        .values({
          orgId,
          clientId: application.clientId,
          applicationId: application.id,
          kind: "candidate_reply",
          ...sealed,
          bodyEnc: encryptPii(replyText(text) || text),
        })
        .returning({ id: inboundEmails.id });
      await recordEvent(tx, {
        orgId,
        clientId: application.clientId,
        applicationId: application.id,
        actor: "candidate",
        type: "message.received",
        payload: { inboundEmailId: row!.id },
      });
    });
    return { kind: "candidate_reply", orgId, applicationId: application.id };
  }

  const orgJobs = await db
    .select({ id: jobs.id, title: jobs.title, clientId: jobs.clientId })
    .from(jobs)
    .where(eq(jobs.orgId, orgId));
  const parsed = parseNotification({ from: message.from, subject, text, jobs: orgJobs });
  if (!parsed.ok) {
    await db.insert(inboundEmails).values({
      orgId,
      kind: parsed.channel ? "job_board" : "other",
      channel: parsed.channel,
      ...sealed,
      bodyEnc: encryptPii(text),
      parsed: { failure: parsed.reason },
    });
    return parsed.channel ? { kind: "job_board", orgId, waitId: null } : { kind: "other", orgId };
  }

  const job = orgJobs.find((j) => j.id === parsed.jobId)!;
  const waitId = await db.transaction(async (tx) => {
    const [email] = await tx
      .insert(inboundEmails)
      .values({
        orgId,
        clientId: job.clientId,
        kind: "job_board",
        channel: parsed.channel,
        ...sealed,
        bodyEnc: encryptPii(text),
        parsed: { jobId: job.id },
      })
      .returning({ id: inboundEmails.id });
    return recordWait(tx, {
      orgId,
      clientId: job.clientId,
      jobId: job.id,
      channel: parsed.channel,
      applicantName: parsed.applicantName,
      inboundEmailId: email!.id,
    });
  });
  return { kind: "job_board", orgId, waitId };
}

/**
 * One "not yet entered" record per person, job and board. Someone who already entered is
 * recorded as entered straight away (the board's email can arrive after the entry).
 */
async function recordWait(
  tx: Tx,
  input: {
    orgId: string;
    clientId: string;
    jobId: string;
    channel: string;
    applicantName: string;
    inboundEmailId: string;
  },
): Promise<string | null> {
  const key = nameKey(input.applicantName);
  const [duplicate] = await tx
    .select({ id: entryWaits.id })
    .from(entryWaits)
    .where(
      and(
        eq(entryWaits.jobId, input.jobId),
        eq(entryWaits.channel, input.channel),
        sql`lower(regexp_replace(normalize(${entryWaits.applicantName}, NFKC), '\\s', '', 'g')) = ${key}`,
      ),
    )
    .limit(1);
  if (duplicate) return null;
  const [entered] = await tx
    .select({ id: applications.id })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .where(
      and(
        eq(applications.jobId, input.jobId),
        sql`lower(regexp_replace(normalize(${candidates.name}, NFKC), '\\s', '', 'g')) = ${key}`,
      ),
    )
    .limit(1);
  const [wait] = await tx
    .insert(entryWaits)
    .values({
      ...input,
      status: entered ? "entered" : "open",
      applicationId: entered?.id ?? null,
    })
    .returning({ id: entryWaits.id });
  await recordEvent(tx, {
    orgId: input.orgId,
    clientId: input.clientId,
    actor: "system",
    type: "job_board.notified",
    payload: { channel: input.channel, jobId: input.jobId, waitId: wait!.id },
  });
  return wait!.id;
}

/** A new entry closes the matching "not yet entered" record (same job, board and name). */
export async function matchEntryWait(
  tx: Tx,
  input: { jobId: string; channel: string | null; name: string; applicationId: string },
): Promise<void> {
  if (!input.channel) return;
  await tx
    .update(entryWaits)
    .set({ status: "entered", applicationId: input.applicationId })
    .where(
      sql`${entryWaits.id} = (
        select w.id from ${entryWaits} w
        where w.job_id = ${input.jobId} and w.channel = ${input.channel} and w.status = 'open'
          and lower(regexp_replace(normalize(w.applicant_name, NFKC), '\\s', '', 'g')) = ${nameKey(input.name)}
        order by w.notified_at limit 1)`,
    );
}
