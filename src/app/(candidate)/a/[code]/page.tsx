import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EntryWizard } from "@/features/intake/components/entry-wizard";
import { loadEntry } from "@/features/intake/entry-server";

export const instant = false; // per-request: open/closed depends on the job and today's date

export const metadata: Metadata = { title: "応募フォーム" };

export default async function EntryPage({ params }: PageProps<"/a/[code]">) {
  const { code } = await params;
  await connection();
  const entry = await loadEntry(code);
  if (!entry) notFound();
  return <EntryWizard entry={entry.view} />;
}
