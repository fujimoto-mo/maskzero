import "server-only";
import type { Interval } from "@/features/scheduling/slots";
import { googleBusy } from "./providers";

// Busy times from the company's Google calendar for the free-slot engine (docs/05 §9), cached for
// five minutes per calendar. Google being slow or unreachable never blocks booking: the slots are
// then offered from mask0's own interviews alone.

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { fetchedAt: number; from: number; to: number; busy: Interval[] }>();

export async function externalBusy(
  orgId: string,
  googleCalendarId: string,
  from: Date,
  to: Date,
  now = Date.now(),
): Promise<Interval[]> {
  const key = `${orgId}:${googleCalendarId}`;
  const hit = cache.get(key);
  if (hit && now - hit.fetchedAt < TTL_MS && hit.from <= from.getTime() && hit.to >= to.getTime()) {
    return hit.busy;
  }
  try {
    const busy = await googleBusy(orgId, googleCalendarId, from, to);
    cache.set(key, { fetchedAt: now, from: from.getTime(), to: to.getTime(), busy });
    return busy;
  } catch (error) {
    console.warn("[calendar] free/busy unavailable", error instanceof Error ? error.message : "");
    return hit?.busy ?? [];
  }
}

/** Forgets a calendar's busy times, after mask0 added or removed one of its events. */
export function forgetBusy(orgId: string, googleCalendarId: string) {
  cache.delete(`${orgId}:${googleCalendarId}`);
}
