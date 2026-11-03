// Booking under concurrency (docs/06, Phase 2 exit): candidates racing for the same slot never end
// up double-booked, and a booking moves the invitation, request and application along. Runs the
// candidate-side code on the admin connection, like the personal-page API routes do.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CandidateScope,
  changeInterviewByCandidate,
  submitBooking,
} from "@/features/interviews/candidate-server";
import { issueInvitation } from "@/features/interviews/server";
import { loadConsents, setRecordingConsent } from "@/features/pool/consent-server";
import { ensureCalendar } from "@/features/scheduling/server";
import { getDb } from "@/server/db/client";

// Never the app's DATABASE_URL, which points at the hosted project (see rls.test.ts).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.DATABASE_URL = testDatabaseUrl; // what getDb() connects to
const admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });

const run = randomUUID().slice(0, 8);
let orgId = "";
let clientId = "";
let jobId = "";
let calendarId = "";

// Monday 6 January 2030, 09:00 in Japan; the default rules open weekdays 10:00–18:00 with a day's
// notice, so Wednesday's slots below are bookable.
const now = new Date("2030-01-07T09:00:00+09:00");
const slot = (hhmm: string) => {
  const startsAt = new Date(`2030-01-09T${hhmm}:00+09:00`);
  return { startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60_000) };
};

async function invitedApplication(): Promise<CandidateScope> {
  const [{ id: candidateId }] = await admin<{ id: string }[]>`
    insert into candidates (org_id, name) values (${orgId}, '予約 テスト') returning id`;
  const [{ id: applicationId }] = await admin<{ id: string }[]>`
    insert into applications (org_id, client_id, job_id, candidate_id, source)
    values (${orgId}, ${clientId}, ${jobId}, ${candidateId}, 'manual') returning id`;
  const scope = { orgId, clientId, applicationId };
  await issueInvitation(getDb(), { ...scope, round: 1, actor: "system" });
  return scope;
}

const book = (scope: CandidateScope, slots: ReturnType<typeof slot>[]) =>
  submitBooking(scope, { slots, concernIds: [], memo: null }, now);

async function scheduledAt(startsAt: Date): Promise<number> {
  const [row] = await admin<{ n: number }[]>`
    select count(*)::int as n from interviews
    where calendar_id = ${calendarId} and status = 'scheduled'
      and tstzrange(starts_at, ends_at) && tstzrange(${startsAt}, ${new Date(startsAt.getTime() + 1)})`;
  return row!.n;
}

beforeAll(async () => {
  [{ id: orgId }] = await admin<{ id: string }[]>`
    insert into organizations (name, slug) values ('予約テスト', ${`booking-${run}`}) returning id`;
  [{ id: clientId }] = await admin<{ id: string }[]>`
    insert into clients (org_id, name, slug, is_default) values (${orgId}, '予約テスト', 'main', true)
    returning id`;
  [{ id: jobId }] = await admin<{ id: string }[]>`
    insert into jobs (org_id, client_id, title) values (${orgId}, ${clientId}, '営業') returning id`;
  ({ calendarId } = await ensureCalendar(getDb(), { orgId, clientId }));
});

afterAll(async () => {
  if (orgId) await admin`delete from organizations where id = ${orgId}`;
  await admin.end();
  await getDb().$client.end();
});

describe("booking", () => {
  it("issues one invitation per round", async () => {
    const scope = await invitedApplication();
    expect(await issueInvitation(getDb(), { ...scope, round: 1, actor: "system" })).toBeNull();
    const [row] = await admin<{ n: number; stage: string }[]>`
      select (select count(*)::int from interview_invitations where application_id = a.id) as n, a.stage
      from applications a where a.id = ${scope.applicationId}`;
    expect(row).toEqual({ n: 1, stage: "booking" });
  });

  it("books a slot wanted by many candidates at once exactly once", async () => {
    const contenders = await Promise.all(Array.from({ length: 8 }, invitedApplication));
    const results = await Promise.all(contenders.map((scope) => book(scope, [slot("10:00")])));

    expect(results.filter((r) => r.status === "confirmed")).toHaveLength(1);
    expect(results.filter((r) => r.status === "unmatched")).toHaveLength(7);
    expect(await scheduledAt(slot("10:00").startsAt)).toBe(1);

    // The losers are handed to staff, the winner is scheduled.
    const states = await admin<
      { stage: string; waiting_on: string | null; next_action: string | null }[]
    >`
      select stage, waiting_on, next_action from applications
      where id = any(${contenders.map((c) => c.applicationId)})`;
    expect(states.filter((s) => s.stage === "scheduled")).toHaveLength(1);
    expect(
      states.filter((s) => s.waiting_on === "staff" && s.next_action === "arrange_interview"),
    ).toHaveLength(7);
  });

  it("falls through to the next preference when the first is taken", async () => {
    const contenders = await Promise.all(Array.from({ length: 3 }, invitedApplication));
    const results = await Promise.all(
      contenders.map((scope) => book(scope, [slot("13:00"), slot("14:00")])),
    );

    const confirmed = results.flatMap((r) => (r.status === "confirmed" ? [r.slot.startsAt] : []));
    expect(confirmed.map((d) => d.toISOString()).sort()).toEqual(
      [slot("13:00").startsAt.toISOString(), slot("14:00").startsAt.toISOString()].sort(),
    );
    expect(results.filter((r) => r.status === "unmatched")).toHaveLength(1);
    expect(await scheduledAt(slot("13:00").startsAt)).toBe(1);
    expect(await scheduledAt(slot("14:00").startsAt)).toBe(1);
  });

  it("frees the slot when the candidate reschedules", async () => {
    const first = await invitedApplication();
    const second = await invitedApplication();
    const booked = await book(first, [slot("16:00")]);
    expect(booked.status).toBe("confirmed");
    expect((await book(second, [slot("16:00")])).status).toBe("unmatched");

    const changed = await changeInterviewByCandidate(first, "reschedule", now);
    expect(changed).toEqual({
      ok: true,
      canceled: [booked.status === "confirmed" ? booked.interviewId : ""],
    });
    const [app] = await admin<{ stage: string; next_action: string | null }[]>`
      select stage, next_action from applications where id = ${first.applicationId}`;
    expect(app).toEqual({ stage: "booking", next_action: "await_booking" });

    // A new answer replaces the unmatched one and gets the freed slot.
    expect((await book(second, [slot("16:00")])).status).toBe("confirmed");
    expect(await scheduledAt(slot("16:00").startsAt)).toBe(1);
  });

  it("does not let a candidate move an interview inside the cutoff", async () => {
    const scope = await invitedApplication();
    expect((await book(scope, [slot("17:00")])).status).toBe("confirmed");
    const lateNow = new Date("2030-01-08T18:00:00+09:00"); // 23 hours before, cutoff is 24
    expect(await changeInterviewByCandidate(scope, "reschedule", lateNow)).toEqual({
      ok: false,
      error: "tooLate",
    });
  });

  it("leaves the request for staff in manual confirmation mode", async () => {
    await admin`update availability_rules set confirm_mode = 'manual' where calendar_id = ${calendarId}`;
    try {
      const scope = await invitedApplication();
      expect((await book(scope, [slot("11:00")])).status).toBe("pending");
      expect(await scheduledAt(slot("11:00").startsAt)).toBe(0);
      const [app] = await admin<{ waiting_on: string | null; next_action: string | null }[]>`
        select waiting_on, next_action from applications where id = ${scope.applicationId}`;
      expect(app).toEqual({ waiting_on: "staff", next_action: "confirm_booking" });
    } finally {
      await admin`update availability_rules set confirm_mode = 'auto' where calendar_id = ${calendarId}`;
    }
  });

  it("keeps a candidate's no to recording on booked and later interviews", async () => {
    await admin`update organizations set records_interviews = true where id = ${orgId}`;
    try {
      const scope = await invitedApplication();
      expect((await book(scope, [slot("15:00")])).status).toBe("confirmed");
      expect((await loadConsents(scope)).recording).toBe(true);

      expect(await setRecordingConsent(scope, false)).toBe(true);
      expect((await loadConsents(scope)).recording).toBe(false);
      const [booked] = await admin<{ recording_allowed: boolean }[]>`
        select recording_allowed from interviews where application_id = ${scope.applicationId}`;
      expect(booked?.recording_allowed).toBe(false);

      // Rebooked after a reschedule: the new interview starts without recording too.
      await changeInterviewByCandidate(scope, "reschedule", now);
      expect((await book(scope, [slot("15:00")])).status).toBe("confirmed");
      const [rebooked] = await admin<{ recording_allowed: boolean }[]>`
        select recording_allowed from interviews
        where application_id = ${scope.applicationId} and status = 'scheduled'`;
      expect(rebooked?.recording_allowed).toBe(false);
    } finally {
      await admin`update organizations set records_interviews = false where id = ${orgId}`;
    }
  });
});
