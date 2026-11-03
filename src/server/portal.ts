import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getPublicEnv } from "@/lib/env";
import { decryptPii, encryptPii } from "@/server/crypto/pii";
import { newToken, sha256 } from "@/server/crypto/tokens";
import type { Db, Tx } from "@/server/db/client";
import { applications } from "@/server/db/schema";

// Links to the candidate's personal page. The token is stored twice: hashed for lookup, and
// encrypted with the PII key so emails and staff can link to it without rotating it.

export const portalUrl = (token: string) => `${getPublicEnv().appUrl}/p/${token}`;
export const bookingUrl = (token: string) => `${portalUrl(token)}/book`;
/** Where the candidate reviews or withdraws consents, and stops job suggestions (M3-8, M5-6). */
export const consentUrl = (token: string) => `${portalUrl(token)}/consent`;

/**
 * The application's personal-page token. Applicants added by hand or from a CSV never had one, so
 * one is issued on first use (it only matters once there is something to link to).
 */
export async function portalTokenFor(conn: Db | Tx, applicationId: string): Promise<string> {
  const [row] = await conn
    .select({ enc: applications.portalTokenEnc })
    .from(applications)
    .where(eq(applications.id, applicationId));
  if (row?.enc) return decryptPii(row.enc);
  const token = newToken();
  const [issued] = await conn
    .update(applications)
    .set({ portalTokenHash: sha256(token), portalTokenEnc: encryptPii(token) })
    .where(and(eq(applications.id, applicationId), isNull(applications.portalTokenEnc)))
    .returning({ id: applications.id });
  if (issued) return token;
  // Issued concurrently: use the stored one.
  const [again] = await conn
    .select({ enc: applications.portalTokenEnc })
    .from(applications)
    .where(eq(applications.id, applicationId));
  return decryptPii(again!.enc!);
}
