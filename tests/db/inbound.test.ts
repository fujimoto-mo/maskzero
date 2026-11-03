// Inbound mail on a real database (docs/02 M3-10): replies attach to the candidate, board
// notifications become "not yet entered" records, and a later entry closes the record. The name
// matching runs in SQL (normalize + regexp_replace), so it is tested here, not only in unit tests.
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestInboundEmail, matchEntryWait } from "@/features/inbound/server";
import { getDb } from "@/server/db/client";
import { protectContact } from "@/server/crypto/pii";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
process.env.DATABASE_URL = testDatabaseUrl; // what getDb() connects to
process.env.PII_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
const admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });

const run = randomUUID().slice(0, 8);
const local = `t${run}`;
const to = [`in+${local}@inbound.example.jp`];
let orgId = "";
let clientId = "";
let jobId = "";
let applicationId = "";

beforeAll(async () => {
  [{ id: orgId }] = await admin<{ id: string }[]>`
    insert into organizations (name, slug, kind, inbound_local_part)
    values ('受信テスト', ${`inbound-${run}`}, 'agency', ${local}) returning id`;
  [{ id: clientId }] = await admin<{ id: string }[]>`
    insert into clients (org_id, name, slug, is_default) values (${orgId}, '受信テスト', 'main', true)
    returning id`;
  [{ id: jobId }] = await admin<{ id: string }[]>`
    insert into jobs (org_id, client_id, title, status)
    values (${orgId}, ${clientId}, '倉庫スタッフ', 'published') returning id`;
  const email = protectContact("email", `reply-${run}@example.com`);
  const [{ id: candidateId }] = await admin<{ id: string }[]>`
    insert into candidates (org_id, name, email_enc, email_hash)
    values (${orgId}, '返信 太郎', ${email.enc}, ${email.hash}) returning id`;
  [{ id: applicationId }] = await admin<{ id: string }[]>`
    insert into applications (org_id, client_id, job_id, candidate_id, source)
    values (${orgId}, ${clientId}, ${jobId}, ${candidateId}, 'manual') returning id`;
});

afterAll(async () => {
  if (orgId) await admin`delete from organizations where id = ${orgId}`;
  await admin.end();
  await getDb().$client.end();
});

describe("inbound mail", () => {
  it("ignores mail for an address that belongs to no company", async () => {
    const result = await ingestInboundEmail({
      to: ["in+nobody123@inbound.example.jp"],
      from: "x@example.com",
      subject: "hi",
      text: "hi",
    });
    expect(result).toEqual({ kind: "unknown_recipient" });
  });

  it("attaches a candidate's reply to their application, stored encrypted", async () => {
    const result = await ingestInboundEmail({
      to,
      from: `Reply Taro <REPLY-${run}@Example.com>`,
      subject: "Re: 面接日時が確定しました",
      text: "承知しました。当日伺います。\n\n> 以前のメール",
    });
    expect(result).toEqual({ kind: "candidate_reply", orgId, applicationId });
    const [row] = await admin<{ body_enc: string; kind: string }[]>`
      select body_enc, kind from inbound_emails where application_id = ${applicationId}`;
    expect(row?.kind).toBe("candidate_reply");
    expect(row?.body_enc).not.toContain("承知しました");
    const [event] = await admin<{ n: number }[]>`
      select count(*)::int as n from events
      where application_id = ${applicationId} and type = 'message.received'`;
    expect(event?.n).toBe(1);
  });

  it("turns a board notification into one waiting record, closed by the entry", async () => {
    const notice = {
      to,
      from: "Indeed <no-reply@indeed.com>",
      subject: "倉庫スタッフ：山田　花子さんから応募がありました",
      text: "求人：倉庫スタッフ",
    };
    const first = await ingestInboundEmail(notice);
    expect(first.kind).toBe("job_board");
    const waitId = first.kind === "job_board" ? first.waitId : null;
    expect(waitId).toBeTruthy();
    // The same notice again (a second forward) adds nothing.
    const again = await ingestInboundEmail(notice);
    expect(again).toEqual({ kind: "job_board", orgId, waitId: null });

    // She enters with her name typed without the space; the record closes.
    const [{ id: candidateId }] = await admin<{ id: string }[]>`
      insert into candidates (org_id, name) values (${orgId}, '山田花子') returning id`;
    const [{ id: entered }] = await admin<{ id: string }[]>`
      insert into applications (org_id, client_id, job_id, candidate_id, source, channel)
      values (${orgId}, ${clientId}, ${jobId}, ${candidateId}, 'entry', 'Indeed') returning id`;
    await getDb().transaction((tx) =>
      matchEntryWait(tx, { jobId, channel: "Indeed", name: "山田花子", applicationId: entered }),
    );
    const [wait] = await admin<{ status: string; application_id: string | null }[]>`
      select status, application_id from entry_waits where id = ${waitId}`;
    expect(wait).toEqual({ status: "entered", application_id: entered });
  });

  it("keeps a notification it could not read for admins, with the reason", async () => {
    const result = await ingestInboundEmail({
      to,
      from: "no-reply@indeed.com",
      subject: "お知らせ",
      text: "メンテナンスのお知らせです。",
    });
    expect(result).toEqual({ kind: "job_board", orgId, waitId: null });
    const [row] = await admin<{ client_id: string | null; parsed: { failure?: string } }[]>`
      select client_id, parsed from inbound_emails
      where org_id = ${orgId} and parsed ? 'failure' order by received_at desc limit 1`;
    expect(row).toEqual({ client_id: null, parsed: { failure: "name" } });
  });
});
