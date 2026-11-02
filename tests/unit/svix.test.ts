import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySvix } from "@/server/webhooks/svix";

const secretBytes = Buffer.from("mask0-test-webhook-secret");
const secret = `whsec_${secretBytes.toString("base64")}`;
const now = new Date("2026-11-04T01:00:00Z");
const timestamp = String(Math.floor(now.getTime() / 1000));
const body = JSON.stringify({ type: "email.delivered", data: { email_id: "abc" } });
const sign = (payload: string) =>
  createHmac("sha256", secretBytes).update(payload).digest("base64");

describe("Svix webhook signatures", () => {
  it("accepts a valid signature among several entries", () => {
    const signature = `v1,bm90LXRoaXMtb25l v1,${sign(`msg_1.${timestamp}.${body}`)}`;
    expect(verifySvix({ secret, id: "msg_1", timestamp, signature, body, now })).toBe(true);
  });

  it("rejects a tampered body, a stale timestamp and missing headers", () => {
    const signature = `v1,${sign(`msg_1.${timestamp}.${body}`)}`;
    expect(verifySvix({ secret, id: "msg_1", timestamp, signature, body: `${body} `, now })).toBe(
      false,
    );
    const later = new Date(now.getTime() + 10 * 60_000);
    expect(verifySvix({ secret, id: "msg_1", timestamp, signature, body, now: later })).toBe(false);
    expect(verifySvix({ secret, id: null, timestamp, signature, body, now })).toBe(false);
  });
});
