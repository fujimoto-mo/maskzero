// The AI interviewer end to end on the database (docs/02 M12, Phase 5): invitation on a pass,
// the candidate's conversation, asking for a person, the deadline, and scoring. Runs the
// candidate-side code on the admin connection like the personal-page API does, with AI_FAKE=1.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  answerAiInterview,
  type CandidateScope,
  closeOverdueSession,
  loadAiSession,
  requestHumanInterview,
  startAiInterview,
} from "@/features/ai-interview/candidate-server";
import { AI_FEATURE } from "@/features/ai-interview/domain";
import { scoreSession } from "@/features/ai-interview/scoring";
import { inviteAfterPass } from "@/features/ai-interview/server";
import { closeOpenScheduling } from "@/features/interviews/server";
import { getDb } from "@/server/db/client";

// Never the app's DATABASE_URL, which points at the hosted project (see rls.test.ts).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.DATABASE_URL = testDatabaseUrl; // what getDb() connects to
process.env.PII_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.AI_FAKE = "1";
const admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });

const run = randomUUID().slice(0, 8);
let orgId = "";
let clientId = "";
let jobId = "";

const LONG =
  "前職では営業チームのリーダーとして、新しい顧客管理の仕組みを導入しました。担当者ごとの訪問記録をまとめ、週に一度の振り返りを始めた結果、半年で成約率が上がりました。";

async function application(): Promise<CandidateScope> {
  const [{ id: candidateId }] = await admin<{ id: string }[]>`
    insert into candidates (org_id, name) values (${orgId}, 'AI 面接') returning id`;
  const [{ id: applicationId }] = await admin<{ id: string }[]>`
    insert into applications (org_id, client_id, job_id, candidate_id, source, stage)
    values (${orgId}, ${clientId}, ${jobId}, ${candidateId}, 'manual', 'screening') returning id`;
  return { orgId, clientId, applicationId };
}

async function invited(): Promise<CandidateScope & { sessionId: string }> {
  const scope = await application();
  const result = await inviteAfterPass(getDb(), { ...scope, round: 1, actor: "system" });
  return { ...scope, sessionId: result.aiSessionId! };
}

async function appState(applicationId: string) {
  const [row] = await admin<{ stage: string; waiting_on: string; next_action: string | null }[]>`
    select stage, waiting_on, next_action from applications where id = ${applicationId}`;
  return row!;
}

beforeAll(async () => {
  [{ id: orgId }] = await admin<{ id: string }[]>`
    insert into organizations (name, slug, feature_flags)
    values ('AI面接テスト', ${`ai-${run}`}, ${[AI_FEATURE]}) returning id`;
  [{ id: clientId }] = await admin<{ id: string }[]>`
    insert into clients (org_id, name, slug, is_default) values (${orgId}, 'AI面接テスト', 'main', true)
    returning id`;
  [{ id: jobId }] = await admin<{ id: string }[]>`
    insert into jobs (org_id, client_id, title) values (${orgId}, ${clientId}, '営業') returning id`;
  const questions = [
    { id: "q1", text: "力を入れたことは？", rubric: "具体的", followUps: 1 },
    { id: "q2", text: "志望理由は？", rubric: "", followUps: 0 },
  ];
  await admin`insert into ai_interview_configs (job_id, org_id, client_id, enabled, questions)
              values (${jobId}, ${orgId}, ${clientId}, true, ${admin.json(questions)})`;
});

afterAll(async () => {
  if (orgId) await admin`delete from organizations where id = ${orgId}`;
  await admin.end();
  await getDb().$client.end();
});

describe("AI interviewer", () => {
  it("invites a passed application to the job's AI interview instead of booking, once", async () => {
    const scope = await invited();
    expect(scope.sessionId).toBeTruthy();
    expect(await appState(scope.applicationId)).toMatchObject({
      stage: "booking",
      waiting_on: "candidate",
      next_action: "await_ai_interview",
    });
    const again = await inviteAfterPass(getDb(), { ...scope, round: 1, actor: "staff" });
    expect(again).toEqual({ invitationId: null, aiSessionId: null });
    const [{ n }] = await admin<{ n: number }[]>`
      select count(*)::int as n from interview_invitations where application_id = ${scope.applicationId}`;
    expect(n).toBe(0);
  });

  it("runs the conversation: consent, follow-up, next question, closing", async () => {
    const scope = await invited();
    const now = new Date();
    expect((await answerAiInterview(scope, "はい", now)).ok).toBe(false); // not started yet
    expect(await startAiInterview(scope, now)).toMatchObject({ ok: true });
    const [consent] = await admin<{ kind: string; granted: boolean }[]>`
      select kind, granted from consents where application_id = ${scope.applicationId}`;
    expect(consent).toEqual({ kind: "ai_interview", granted: true });

    // A short answer gets the question's one follow-up; then the next question; then the end.
    await answerAiInterview(scope, "営業です。", now);
    let view = (await loadAiSession(scope, now))!;
    expect(view.turns.map((t) => t.kind)).toEqual(["question", "answer", "follow_up"]);
    await answerAiInterview(scope, LONG, now);
    view = (await loadAiSession(scope, now))!;
    expect(view.turns.at(-1)).toMatchObject({ kind: "question", questionId: "q2" });
    expect(view.currentQuestion).toBe(1);
    const last = await answerAiInterview(scope, "御社の仕事に興味があります。", now);
    expect(last).toMatchObject({ ok: true, completed: true });
    view = (await loadAiSession(scope, now))!;
    expect(view.status).toBe("completed");
    expect(view.turns.at(-1)?.kind).toBe("closing");
    expect(await answerAiInterview(scope, "追加です", now)).toEqual({
      ok: false,
      error: "notOpen",
    });

    // The transcript is stored encrypted.
    const [row] = await admin<{ transcript_enc: string }[]>`
      select transcript_enc from ai_interview_sessions where id = ${scope.sessionId}`;
    expect(row!.transcript_enc).not.toContain("営業");

    // Scoring proposes; the application waits for a person.
    const scored = await scoreSession(scope.sessionId, orgId);
    expect(scored.applicationId).toBe(scope.applicationId);
    const [session] = await admin<
      {
        status: string;
        band: string;
        total: string;
        scores: { evidence: { verified: boolean }[] }[];
      }[]
    >`select status, band, total, scores from ai_interview_sessions where id = ${scope.sessionId}`;
    expect(session!.status).toBe("scored");
    expect(["A", "B", "C", "D"]).toContain(session!.band);
    expect(session!.scores.flatMap((s) => s.evidence).every((e) => e.verified)).toBe(true);
    expect(await appState(scope.applicationId)).toMatchObject({
      stage: "evaluation",
      waiting_on: "staff",
      next_action: "review_ai_interview",
    });
    const [event] = await admin<{ payload: Record<string, unknown> }[]>`
      select payload from events
      where application_id = ${scope.applicationId} and type = 'ai_interview.scored'`;
    expect(Object.keys(event!.payload).sort()).toEqual(["band", "sessionId", "total"]);
    // Scoring twice changes nothing.
    expect((await scoreSession(scope.sessionId, orgId)).applicationId).toBeNull();
  });

  it("refuses answers that are empty or too long", async () => {
    const scope = await invited();
    await startAiInterview(scope, new Date());
    expect(await answerAiInterview(scope, "   ", new Date())).toEqual({
      ok: false,
      error: "empty",
    });
    expect(await answerAiInterview(scope, "あ".repeat(2001), new Date())).toEqual({
      ok: false,
      error: "tooLong",
    });
  });

  it("switches to a person when the candidate asks", async () => {
    const scope = await invited();
    expect(await requestHumanInterview(scope)).toMatchObject({ ok: true });
    const [session] = await admin<{ status: string; flags: { humanRequested?: boolean } }[]>`
      select status, flags from ai_interview_sessions where id = ${scope.sessionId}`;
    expect(session).toEqual({ status: "aborted", flags: { humanRequested: true } });
    expect(await appState(scope.applicationId)).toMatchObject({ next_action: "await_booking" });
    expect(await requestHumanInterview(scope)).toEqual({ ok: false });
  });

  it("expires an unstarted interview at the deadline and hands it to staff", async () => {
    const scope = await invited();
    const late = new Date(Date.now() + 30 * 86400_000);
    expect(await startAiInterview(scope, late)).toEqual({ ok: false, error: "expired" });
    expect(await closeOverdueSession(scope.sessionId, orgId, late)).toBe("expired");
    expect(await appState(scope.applicationId)).toMatchObject({
      waiting_on: "staff",
      next_action: "ai_interview_expired",
    });
    expect(await closeOverdueSession(scope.sessionId, orgId, late)).toBe("none");
  });

  it("completes a started interview with what was answered once its time runs out", async () => {
    const scope = await invited();
    const start = new Date();
    await startAiInterview(scope, start);
    await answerAiInterview(scope, LONG, start);
    expect(await closeOverdueSession(scope.sessionId, orgId, start)).toBe("none");
    const after = new Date(start.getTime() + 31 * 60_000);
    expect(await closeOverdueSession(scope.sessionId, orgId, after)).toBe("completed");
    const [session] = await admin<{ status: string; flags: { partial?: boolean } }[]>`
      select status, flags from ai_interview_sessions where id = ${scope.sessionId}`;
    expect(session).toEqual({ status: "completed", flags: { partial: true } });
  });

  it("ends an open AI interview when the application leaves the process", async () => {
    const scope = await invited();
    await closeOpenScheduling(getDb(), scope.applicationId);
    const [session] = await admin<{ status: string }[]>`
      select status from ai_interview_sessions where id = ${scope.sessionId}`;
    expect(session!.status).toBe("aborted");
    expect(await startAiInterview(scope, new Date())).toEqual({ ok: false, error: "notOpen" });
  });

  it("books with a person when the company doesn't have the feature", async () => {
    await admin`update organizations set feature_flags = '{}' where id = ${orgId}`;
    try {
      const scope = await application();
      const result = await inviteAfterPass(getDb(), { ...scope, round: 1, actor: "system" });
      expect(result.aiSessionId).toBeNull();
      expect(result.invitationId).toBeTruthy();
    } finally {
      await admin`update organizations set feature_flags = ${[AI_FEATURE]} where id = ${orgId}`;
    }
  });
});
