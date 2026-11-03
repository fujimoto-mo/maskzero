import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaForm } from "@/features/auth/components/mfa-form";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { requireUser } from "@/server/auth/session";
import { getMfaState } from "@/server/auth/mfa";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "二段階認証" };

export default async function MfaPage({ searchParams }: PageProps<"/mfa">) {
  const query = await searchParams;
  await requireUser();
  const next = safeRedirectPath(query.next);
  const setup = query.setup === "1";
  const state = await getMfaState();

  // Already through the second step, and not here to add another app.
  if (state.verified && !setup) redirect(next);
  const challenge = state.factors.length > 0 && !state.verified;
  return (
    <MfaForm
      factorId={challenge ? state.factors[0]!.id : null}
      next={next}
      required={query.required === "1"}
    />
  );
}
