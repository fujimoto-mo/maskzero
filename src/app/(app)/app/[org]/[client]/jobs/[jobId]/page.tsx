import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobEditor } from "@/features/jobs/components/job-editor";
import { getJob } from "@/features/jobs/queries";
import { isUuid } from "@/lib/utils";
import { canEdit, requireMember } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

export const metadata: Metadata = { title: "求人の編集" };

export default async function JobPage({ params }: PageProps<"/app/[org]/[client]/jobs/[jobId]">) {
  const { org, client, jobId } = await params;
  const ctx = await requireMember(org, client);
  if (!isUuid(jobId)) notFound();
  const job = await getJob(ctx, jobId);

  return (
    <JobEditor
      orgSlug={ctx.orgSlug}
      clientSlug={ctx.clientSlug}
      job={job}
      // Archived jobs keep their applicants' history and are read-only.
      canEdit={canEdit(ctx) && job.status !== "archived"}
    />
  );
}
