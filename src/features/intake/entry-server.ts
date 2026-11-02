import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { formatPay } from "@/features/jobs/checks";
import { japanToday } from "@/features/jobs/mutations";
import { postingFieldsSchema } from "@/features/jobs/schema";
import { STANDARD_ANSWER_KEYS } from "@/features/screening/presets";
import { protectContact } from "@/server/crypto/pii";
import { newToken, sha256 } from "@/server/crypto/tokens";
import { getAdminDb } from "@/server/db/admin";
import type { Tx } from "@/server/db/client";
import {
  applicationAnswers,
  applications,
  candidates,
  clients,
  consents,
  documents,
  entryUrls,
  jobImages,
  jobs,
  organizations,
  screeningCriteria,
  screeningSettings,
} from "@/server/db/schema";
import { recordEvent } from "@/server/events";
import { createSignedUpload, publicUrl, removeObjects } from "@/server/storage";
import {
  OTHER_JOBS_TEXT_VERSION,
  otherJobsNotice,
  privacyNotice,
  privacyTextVersion,
} from "./consent";
import {
  cleanAnswers,
  type DocumentKind,
  type EntryFile,
  type EntryInput,
  type EntryQuestion,
} from "./entry-schema";

// Candidate-facing intake (docs/02 M3). These run without a staff session, so they use the admin
// database connection and scope every query by the entry code or the personal-page token.

/** What the entry page shows; safe to send to the browser. */
export type EntryView = {
  code: string;
  open: boolean;
  channel: string;
  company: string;
  /** The recruiting agency that handles the application, for agency accounts. */
  agency: string | null;
  job: {
    title: string;
    displayTitle: string | null;
    employmentType: string | null;
    address: string | null;
    pay: string;
    imageUrl: string | null;
  };
  requiresCv: boolean;
  questions: EntryQuestion[];
  retentionDays: number;
  notice: string[];
  otherJobsLabel: string | null;
};

type EntryScope = {
  entryUrlId: string;
  jobId: string;
  orgId: string;
  clientId: string;
  /** Version of the privacy notice this page showed. */
  privacyVersion: string;
};

export type EntryContext = { view: EntryView; scope: EntryScope };

const STANDARD_KEYS = new Set<string>(Object.values(STANDARD_ANSWER_KEYS));

/**
 * The agency named to candidates, only when it recruits for a client other than itself (every
 * account starts with a default client that carries its own name).
 */
const agencyName = (row: { orgKind: string; orgName: string; clientName: string }) =>
  row.orgKind === "agency" && row.clientName !== row.orgName ? row.orgName : null;
const CODE_PATTERN = /^[A-Za-z0-9]{6,12}$/;

function toQuestion(row: {
  id: string;
  label: string;
  kind: string | null;
  config: unknown;
}): EntryQuestion | null {
  const config = (row.config ?? {}) as Record<string, unknown>;
  // Pay band and start date are asked by the standard questions already.
  if (typeof config.answerKey === "string" && STANDARD_KEYS.has(config.answerKey)) return null;
  const options = Array.isArray(config.options)
    ? config.options.filter((o): o is string => typeof o === "string")
    : [];
  if (row.kind === "choices" && options.length > 0) {
    return { id: row.id, label: row.label, kind: "choices", options, multi: config.multi === true };
  }
  if (row.kind === "dropdown" && options.length > 0) {
    return { id: row.id, label: row.label, kind: "dropdown", options };
  }
  if (row.kind === "range") {
    const unit = typeof config.unit === "string" ? config.unit : "";
    return { id: row.id, label: row.label, kind: "range", unit };
  }
  return null;
}

export async function loadEntry(code: string): Promise<EntryContext | null> {
  if (!CODE_PATTERN.test(code)) return null;
  const db = getAdminDb();
  const [row] = await db
    .select({
      entryUrlId: entryUrls.id,
      enabled: entryUrls.enabled,
      channel: entryUrls.channel,
      jobId: jobs.id,
      jobStatus: jobs.status,
      postingFields: jobs.postingFields,
      postingFrom: jobs.postingFrom,
      postingTo: jobs.postingTo,
      requiresCv: jobs.requiresCv,
      orgId: organizations.id,
      orgName: organizations.name,
      orgKind: organizations.kind,
      retentionDays: organizations.docRetentionDays,
      clientId: clients.id,
      clientName: clients.name,
      confirmRejections: screeningSettings.confirmRejections,
    })
    .from(entryUrls)
    .innerJoin(jobs, eq(jobs.id, entryUrls.jobId))
    .innerJoin(organizations, eq(organizations.id, entryUrls.orgId))
    .innerJoin(clients, eq(clients.id, entryUrls.clientId))
    .leftJoin(screeningSettings, eq(screeningSettings.jobId, entryUrls.jobId))
    .where(eq(entryUrls.code, code));
  if (!row) return null;

  const [criteria, [mainImage]] = await Promise.all([
    db
      .select({
        id: screeningCriteria.id,
        label: screeningCriteria.label,
        kind: screeningCriteria.kind,
        config: screeningCriteria.config,
      })
      .from(screeningCriteria)
      .where(
        and(
          eq(screeningCriteria.jobId, row.jobId),
          eq(screeningCriteria.type, "basic"),
          eq(screeningCriteria.source, "form"),
        ),
      )
      .orderBy(asc(screeningCriteria.position)),
    db
      .select({ path: jobImages.storagePath })
      .from(jobImages)
      .where(and(eq(jobImages.jobId, row.jobId), eq(jobImages.slot, 1))),
  ]);

  const fields = postingFieldsSchema.catch({}).parse(row.postingFields);
  const today = japanToday();
  const open =
    row.enabled &&
    row.jobStatus === "published" &&
    (!row.postingFrom || row.postingFrom <= today) &&
    (!row.postingTo || today <= row.postingTo);
  const agency = agencyName(row);
  const company = agency ? row.clientName : row.orgName;
  // A job without settings uses the defaults, where a person confirms every rejection.
  const humanReviewsRejections = row.confirmRejections ?? true;

  return {
    view: {
      code,
      open,
      channel: row.channel,
      company,
      agency,
      job: {
        title: fields.title ?? "",
        displayTitle: fields.displayTitle || null,
        employmentType: fields.employmentType || null,
        address: fields.address || null,
        pay: formatPay(fields),
        imageUrl: mainImage ? publicUrl("job-images", mainImage.path) : null,
      },
      requiresCv: row.requiresCv,
      questions: criteria.map(toQuestion).filter((q): q is EntryQuestion => q !== null),
      retentionDays: row.retentionDays,
      notice: privacyNotice({
        company,
        agency,
        retentionDays: row.retentionDays,
        humanReviewsRejections,
      }),
      otherJobsLabel: agency ? otherJobsNotice(agency) : null,
    },
    scope: {
      entryUrlId: row.entryUrlId,
      jobId: row.jobId,
      orgId: row.orgId,
      clientId: row.clientId,
      privacyVersion: privacyTextVersion(humanReviewsRejections),
    },
  };
}

export type SignedUpload = { index: number; path: string; token: string };

const EXTENSIONS: Record<EntryFile["type"], string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/** Document rows in "uploading" state; the pipeline verifies the bytes once the upload lands. */
async function insertDocumentRows(
  tx: Tx,
  scope: { orgId: string; clientId: string; applicationId: string },
  files: EntryFile[],
): Promise<string[]> {
  if (files.length === 0) return [];
  const rows = files.map((file) => {
    const id = randomUUID();
    return {
      id,
      orgId: scope.orgId,
      clientId: scope.clientId,
      applicationId: scope.applicationId,
      kind: file.kind,
      storagePath: `org/${scope.orgId}/app/${scope.applicationId}/${id}.${EXTENSIONS[file.type]}`,
      fileName: file.name,
      mime: file.type,
      bytes: file.size,
      uploadedBy: "candidate" as const,
    };
  });
  await tx.insert(documents).values(rows);
  return rows.map((r) => r.storagePath);
}

async function signUploads(paths: string[]): Promise<SignedUpload[]> {
  return Promise.all(
    paths.map(async (path, index) => ({ index, ...(await createSignedUpload("documents", path)) })),
  );
}

export type EntryResult = {
  applicationId: string;
  /** False for a repeat entry by the same person for the same job. */
  created: boolean;
  /** The new personal-page token; stored only as a hash. */
  token: string;
  /** The name on file, which a repeat entry does not change. */
  candidateName: string;
  uploads: SignedUpload[];
};

/**
 * Records an entry: the same email in the org is the same candidate, and the same candidate and
 * job is the same application (new documents are added, nothing is duplicated).
 *
 * Anyone can type someone else's email, so a repeat entry never changes the stored details, and
 * its new personal-page token goes only to the email address on file (see the entry route).
 */
export async function createEntryApplication(
  { view, scope }: EntryContext,
  input: EntryInput,
): Promise<EntryResult> {
  const email = protectContact("email", input.email);
  const phone = protectContact("phone", input.phone);
  const token = newToken();
  const answers = cleanAnswers(view.questions, input.answers);

  const result = await getAdminDb().transaction(async (tx) => {
    const [candidate] = await tx
      .insert(candidates)
      .values({
        orgId: scope.orgId,
        name: input.name,
        emailEnc: email.enc,
        emailHash: email.hash,
        phoneEnc: phone.enc,
        phoneHash: phone.hash,
        prefecture: input.prefecture,
        city: input.city,
      })
      .onConflictDoUpdate({
        target: [candidates.orgId, candidates.emailHash],
        // A no-op update, only so the existing row's id comes back.
        set: { emailHash: sql`excluded.email_hash` },
      })
      .returning({ id: candidates.id, name: candidates.name });

    const [application] = await tx
      .insert(applications)
      .values({
        orgId: scope.orgId,
        clientId: scope.clientId,
        jobId: scope.jobId,
        candidateId: candidate!.id,
        entryUrlId: scope.entryUrlId,
        channel: view.channel,
        source: "entry",
        waitingOn: "candidate",
        portalTokenHash: sha256(token),
        otherJobsOptIn: Boolean(view.agency) && input.otherJobsOptIn,
      })
      .onConflictDoUpdate({
        target: [applications.jobId, applications.candidateId],
        // Only the token changes: a repeat entry never moves an application back.
        set: { portalTokenHash: sha256(token) },
      })
      .returning({ id: applications.id, created: sql<boolean>`(xmax = 0)` });
    const applicationId = application!.id;

    const answerRows = [
      { key: STANDARD_ANSWER_KEYS.payBand, value: input.payBand },
      { key: STANDARD_ANSWER_KEYS.startTiming, value: input.startTiming },
      ...Object.entries(answers).map(([id, value]) => ({ key: `criterion:${id}`, value })),
    ].map((a) => ({ ...a, applicationId, orgId: scope.orgId, clientId: scope.clientId }));
    // First answers stand: like contact details, a repeat entry can't change what is screened.
    await tx.insert(applicationAnswers).values(answerRows).onConflictDoNothing();

    const consentBase = {
      orgId: scope.orgId,
      clientId: scope.clientId,
      candidateId: candidate!.id,
      applicationId,
    };
    await tx.insert(consents).values([
      { ...consentBase, kind: "privacy", granted: true, textVersion: scope.privacyVersion },
      ...(view.agency
        ? [
            {
              ...consentBase,
              kind: "other_jobs" as const,
              granted: input.otherJobsOptIn,
              textVersion: OTHER_JOBS_TEXT_VERSION,
            },
          ]
        : []),
    ]);

    const paths = await insertDocumentRows(tx, { ...scope, applicationId }, input.files);
    await recordEvent(tx, {
      orgId: scope.orgId,
      clientId: scope.clientId,
      applicationId,
      actor: "candidate",
      type: application!.created ? "application.created" : "application.reentered",
      payload: { jobId: scope.jobId, entryUrlId: scope.entryUrlId, channel: view.channel },
    });
    return { applicationId, created: application!.created, name: candidate!.name, paths };
  });

  return {
    applicationId: result.applicationId,
    created: result.created,
    token,
    candidateName: result.name,
    uploads: await signUploads(result.paths),
  };
}

// ------------------------------------------------------------------------------------------------
// Personal page (/p/{token})
// ------------------------------------------------------------------------------------------------

export type PortalStatus =
  "documents" | "screening" | "interview" | "offer" | "hired" | "closed" | "withdrawn";

export type PortalView = {
  candidateName: string;
  jobTitle: string;
  company: string;
  agency: string | null;
  status: PortalStatus;
  requiresCv: boolean;
  documents: {
    id: string;
    kind: DocumentKind | "other";
    fileName: string;
    ready: boolean;
    createdAt: string;
  }[];
  uploadsAllowed: boolean;
};

export type PortalContext = {
  view: PortalView;
  scope: { applicationId: string; orgId: string; clientId: string };
};

function portalStatus(
  stage: (typeof applications.$inferSelect)["stage"],
  outcome: (typeof applications.$inferSelect)["outcome"],
  hasResume: boolean,
): PortalStatus {
  if (outcome === "withdrawn") return "withdrawn";
  if (outcome === "rejected") return "closed";
  if (outcome === "hired" || stage === "hired") return "hired";
  if (stage === "offer") return "offer";
  if (stage === "applied" || stage === "screening") return hasResume ? "screening" : "documents";
  return "interview";
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export async function loadPortal(token: string): Promise<PortalContext | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const db = getAdminDb();
  const [row] = await db
    .select({
      applicationId: applications.id,
      orgId: applications.orgId,
      clientId: applications.clientId,
      stage: applications.stage,
      outcome: applications.outcome,
      candidateName: candidates.name,
      postingFields: jobs.postingFields,
      requiresCv: jobs.requiresCv,
      orgName: organizations.name,
      orgKind: organizations.kind,
      clientName: clients.name,
    })
    .from(applications)
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .innerJoin(organizations, eq(organizations.id, applications.orgId))
    .innerJoin(clients, eq(clients.id, applications.clientId))
    .where(eq(applications.portalTokenHash, sha256(token)));
  if (!row) return null;

  const docs = await db
    .select({
      id: documents.id,
      kind: documents.kind,
      fileName: documents.fileName,
      status: documents.status,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.applicationId, row.applicationId), eq(documents.orgId, row.orgId)))
    .orderBy(asc(documents.createdAt));
  const live = docs.filter((d) => d.status !== "rejected");
  const hasResume = live.some((d) => d.kind === "resume");
  const status = portalStatus(row.stage, row.outcome, hasResume);
  const fields = postingFieldsSchema.catch({}).parse(row.postingFields);
  const agency = agencyName(row);

  return {
    view: {
      candidateName: row.candidateName,
      jobTitle: fields.title ?? "",
      company: agency ? row.clientName : row.orgName,
      agency,
      status,
      requiresCv: row.requiresCv,
      documents: live.map((d) => ({
        id: d.id,
        kind: d.kind,
        fileName: d.fileName,
        ready: d.status === "ready",
        createdAt: d.createdAt.toISOString(),
      })),
      uploadsAllowed: status === "documents" || status === "screening",
    },
    scope: { applicationId: row.applicationId, orgId: row.orgId, clientId: row.clientId },
  };
}

/** Adds documents from the personal page; `replace` kinds drop the earlier files of that kind first. */
export async function addPortalDocuments(
  { scope }: PortalContext,
  files: EntryFile[],
  replace: DocumentKind[],
): Promise<SignedUpload[]> {
  const { removed, paths } = await getAdminDb().transaction(async (tx) => {
    const removed =
      replace.length > 0
        ? await tx
            .delete(documents)
            .where(
              and(
                eq(documents.applicationId, scope.applicationId),
                eq(documents.orgId, scope.orgId),
                inArray(documents.kind, replace),
              ),
            )
            .returning({ path: documents.storagePath })
        : [];
    const paths = await insertDocumentRows(tx, scope, files);
    await recordEvent(tx, {
      ...scope,
      actor: "candidate",
      type: "documents.added",
      payload: { count: files.length, replaced: replace },
    });
    return { removed: removed.map((r) => r.path), paths };
  });
  await removeObjects("documents", removed);
  return signUploads(paths);
}

/**
 * The candidate finished uploading: hand the application to the screening pipeline. Returns the
 * org for the pipeline event, or null for an unknown application.
 */
export async function markSubmitted(applicationId: string): Promise<{ orgId: string } | null> {
  return getAdminDb().transaction(async (tx) => {
    const [application] = await tx
      .update(applications)
      .set({ waitingOn: "system" })
      .where(eq(applications.id, applicationId))
      .returning({ orgId: applications.orgId, clientId: applications.clientId });
    if (!application) return null;
    await recordEvent(tx, {
      ...application,
      applicationId,
      actor: "candidate",
      type: "application.submitted",
    });
    return { orgId: application.orgId };
  });
}
