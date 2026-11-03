import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type MfaState = {
  /** Whether this session passed the second step. */
  verified: boolean;
  factors: { id: string; createdAt: string }[];
};

/** The signed-in user's authenticator apps and this session's assurance level. */
export async function getMfaState(): Promise<MfaState> {
  const supabase = await createSupabaseServerClient();
  const [{ data: factors }, { data: level }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  return {
    verified: level?.currentLevel === "aal2",
    factors: (factors?.totp ?? []).map((f) => ({ id: f.id, createdAt: f.created_at })),
  };
}
