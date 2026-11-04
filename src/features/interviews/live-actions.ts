"use server";

import { isUuid } from "@/lib/utils";
import { requireMember } from "@/server/auth/session";
import { getLiveView, type LiveView } from "./live-server";

/** What the live page polls every few seconds (docs/02 M11-7): new utterances and suggestions. */
export async function pollLiveAction(
  orgSlug: string,
  clientSlug: string,
  interviewId: string,
  afterId: string | null,
): Promise<LiveView | null> {
  const ctx = await requireMember(orgSlug, clientSlug);
  if (!isUuid(interviewId) || (afterId !== null && !isUuid(afterId))) return null;
  return getLiveView(ctx, interviewId, afterId);
}
