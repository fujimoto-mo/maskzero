import { redirect } from "next/navigation";

export const instant = false; // redirects based on route params (CLAUDE.md, "Cache Components")

export default async function ClientIndexPage({ params }: PageProps<"/app/[org]/[client]">) {
  const { org, client } = await params;
  redirect(`/app/${org}/${client}/dashboard`);
}
