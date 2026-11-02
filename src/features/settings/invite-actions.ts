"use server";

import { sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { sha256 } from "@/server/crypto/tokens";
import { withRls } from "@/server/db/rls";

/**
 * Joins the organization as the signed-in user. private.accept_invitation() checks that the
 * invitation is open and addressed to this user's email.
 */
export async function acceptInvitationAction(token: string): Promise<void> {
  const user = await requireUser();
  let target: string;
  try {
    const [row] = await withRls(user, (tx) =>
      tx.execute<{ org_slug: string; client_slug: string }>(
        sql`select org_slug, client_slug from private.accept_invitation(${sha256(token)})`,
      ),
    );
    if (!row) throw new Error("no organization");
    target = `/app/${row.org_slug}/${row.client_slug}/dashboard`;
  } catch {
    target = `/invite/${encodeURIComponent(token)}?error=1`;
  }
  redirect(target);
}
