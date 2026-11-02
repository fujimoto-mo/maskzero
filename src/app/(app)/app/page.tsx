import { redirect } from "next/navigation";
import { getHomePath, requireUser } from "@/server/auth/session";

export const instant = false; // reads the session per request (CLAUDE.md, "Cache Components")

/** /app sends signed-in users to their dashboard, or to onboarding if they have no company yet. */
export default async function AppIndexPage() {
  const user = await requireUser();
  redirect((await getHomePath(user)) ?? "/onboarding");
}
