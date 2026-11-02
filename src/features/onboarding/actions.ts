"use server";

import { sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { orgCreated } from "@/server/jobs/events";
import { sendEventBestEffort } from "@/server/jobs/send";
import { onboardingSchema, type OnboardingErrorKey } from "./schema";

export type OnboardingFormState = {
  error?: string;
  values?: { companyName?: string; kind?: string };
};

export async function createOrganizationAction(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const user = await requireUser();
  const t = await getTranslations("Onboarding.errors");
  const values = {
    companyName: String(formData.get("companyName") ?? ""),
    kind: String(formData.get("kind") ?? "inhouse"),
  };
  const parsed = onboardingSchema.safeParse(values);
  if (!parsed.success) {
    return {
      error: t((parsed.error.issues[0]?.message ?? "nameRequired") as OnboardingErrorKey),
      values,
    };
  }

  // private.create_organization() creates the org, its default client and the owner membership in
  // one transaction; it is SECURITY DEFINER and identifies the caller through auth.uid().
  const [created] = await withRls(user, (tx) =>
    tx.execute<{ created_org_id: string; org_slug: string; client_slug: string }>(
      sql`select created_org_id, org_slug, client_slug
          from private.create_organization(${parsed.data.companyName}, ${parsed.data.kind})`,
    ),
  );
  if (!created) throw new Error("create_organization returned no row");

  await sendEventBestEffort(
    orgCreated.create({ orgId: created.created_org_id, userId: user.userId }),
  );

  redirect(`/app/${created.org_slug}/${created.client_slug}/dashboard`);
}
