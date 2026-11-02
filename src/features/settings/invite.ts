import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { sha256 } from "@/server/crypto/tokens";
import { getAdminDb } from "@/server/db/admin";
import { invitations, organizations } from "@/server/db/schema";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** An open invitation by its link token, for the accept page (which may run before sign-in). */
export async function findInvitation(
  token: string,
): Promise<{ orgName: string; email: string } | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const [row] = await getAdminDb()
    .select({ orgName: organizations.name, email: invitations.email })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(
      and(
        eq(invitations.tokenHash, sha256(token)),
        isNull(invitations.acceptedAt),
        gte(invitations.expiresAt, sql`now()`),
      ),
    );
  return row ?? null;
}
