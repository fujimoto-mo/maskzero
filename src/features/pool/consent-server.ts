import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getAdminDb } from "@/server/db/admin";
import { applications, consents, organizations } from "@/server/db/schema";
import { recordEvent } from "@/server/events";

// The candidate's consents on their personal page (docs/02 M3-8, M5-6). Consents are append-only:
// a change adds a row, and the latest row of a kind is what counts.

export type CandidateScope = { applicationId: string; orgId: string; clientId: string };

export type ConsentView = {
  privacyAt: string | null;
  /** null where the company doesn't suggest other jobs (in-house companies). */
  otherJobs: boolean | null;
};

/** Text version recorded when the candidate changes the opt-in on the consent page. */
export const CONSENT_PAGE_VERSION = "consent-page-v1";

async function candidateOf(scope: CandidateScope) {
  const [row] = await getAdminDb()
    .select({ candidateId: applications.candidateId, orgKind: organizations.kind })
    .from(applications)
    .innerJoin(organizations, eq(organizations.id, applications.orgId))
    .where(and(eq(applications.id, scope.applicationId), eq(applications.orgId, scope.orgId)));
  return row ?? null;
}

export async function loadConsents(scope: CandidateScope): Promise<ConsentView> {
  const owner = await candidateOf(scope);
  if (!owner) return { privacyAt: null, otherJobs: null };
  const db = getAdminDb();
  const [[privacy], [otherJobs]] = await Promise.all([
    db
      .select({ at: consents.createdAt })
      .from(consents)
      .where(and(eq(consents.applicationId, scope.applicationId), eq(consents.kind, "privacy")))
      .orderBy(desc(consents.createdAt))
      .limit(1),
    db
      .select({ granted: consents.granted })
      .from(consents)
      .where(
        and(
          eq(consents.orgId, scope.orgId),
          eq(consents.candidateId, owner.candidateId),
          eq(consents.kind, "other_jobs"),
        ),
      )
      .orderBy(desc(consents.createdAt))
      .limit(1),
  ]);
  return {
    privacyAt: privacy?.at.toISOString() ?? null,
    otherJobs: owner.orgKind === "agency" ? (otherJobs?.granted ?? false) : null,
  };
}

/** Starts or stops job suggestions for the candidate across the company (one-click stop, M5-6). */
export async function setOtherJobsConsent(
  scope: CandidateScope,
  granted: boolean,
): Promise<boolean> {
  const owner = await candidateOf(scope);
  if (!owner || owner.orgKind !== "agency") return false;
  await getAdminDb().transaction(async (tx) => {
    await tx.insert(consents).values({
      orgId: scope.orgId,
      clientId: scope.clientId,
      candidateId: owner.candidateId,
      applicationId: scope.applicationId,
      kind: "other_jobs",
      granted,
      textVersion: CONSENT_PAGE_VERSION,
    });
    await tx
      .update(applications)
      .set({ otherJobsOptIn: granted })
      .where(
        and(eq(applications.orgId, scope.orgId), eq(applications.candidateId, owner.candidateId)),
      );
    await recordEvent(tx, {
      orgId: scope.orgId,
      clientId: scope.clientId,
      applicationId: scope.applicationId,
      actor: "candidate",
      type: granted ? "consent.granted" : "consent.withdrawn",
      payload: { kind: "other_jobs" },
    });
  });
  return true;
}
