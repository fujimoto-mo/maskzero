"use server";

import { and, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { insertSampleJob } from "@/features/jobs/mutations";
import { requireUser } from "@/server/auth/session";
import { withRls } from "@/server/db/rls";
import { clients } from "@/server/db/schema";
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
  if (user.demo) redirect("/demo");
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

  // private.create_organization() creates the org, its default client and the owner membership; it
  // is SECURITY DEFINER and identifies the caller through auth.uid(). The sample job is added in
  // the same transaction, as the new owner, so a company never starts half set up.
  const created = await withRls(user, async (tx) => {
    const [row] = await tx.execute<{
      created_org_id: string;
      org_slug: string;
      client_slug: string;
    }>(
      sql`select created_org_id, org_slug, client_slug
          from private.create_organization(${parsed.data.companyName}, ${parsed.data.kind})`,
    );
    if (!row) throw new Error("create_organization returned no row");
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.orgId, row.created_org_id), eq(clients.slug, row.client_slug)));
    await insertSampleJob(tx, {
      orgId: row.created_org_id,
      clientId: client!.id,
      userId: user.userId,
    });
    return row;
  });

  await sendEventBestEffort(
    orgCreated.create({ orgId: created.created_org_id, userId: user.userId }),
  );

  redirect(`/app/${created.org_slug}/${created.client_slug}/dashboard`);
}
