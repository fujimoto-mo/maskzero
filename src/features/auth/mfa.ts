"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { requireUser } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/supabase/server";

// TOTP two-factor authentication through Supabase Auth (docs/02 M1-6): optional for everyone,
// required for owners and admins (requireMember sends them to /mfa until the session is aal2).

export type Enrollment = { factorId: string; qrCode: string; secret: string };

/** Starts adding an authenticator app; earlier unfinished attempts are discarded first. */
export async function startTotpEnrollmentAction(): Promise<Enrollment | null> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "mask0",
    friendlyName: `mask0-${Date.now()}`,
  });
  if (error || !data) return null;
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const verifySchema = z.object({
  factorId: z.uuid(),
  code: z.string().regex(/^\d{6}$/),
  next: z.string().max(500),
});

/**
 * Checks a 6-digit code: finishes an enrollment or signs in the second step. The session is then
 * aal2 (its cookies are rewritten here) and the user goes on to `next`.
 */
export async function verifyTotpAction(
  input: z.input<typeof verifySchema>,
): Promise<{ ok: false }> {
  await requireUser();
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: parsed.data.factorId,
    code: parsed.data.code,
  });
  if (error) return { ok: false };
  redirect(safeRedirectPath(parsed.data.next));
}

/** Removes an authenticator app (Supabase requires an aal2 session while one is verified). */
export async function removeTotpAction(factorId: string, next: string): Promise<{ ok: false }> {
  await requireUser();
  const id = z.uuid().parse(factorId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
  if (error) return { ok: false };
  redirect(safeRedirectPath(next));
}
