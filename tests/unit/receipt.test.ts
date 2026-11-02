import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { signReceipt, verifyReceipt } from "@/server/crypto/receipt";

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("entry receipts", () => {
  const id = "01a19c70-da80-7e9d-8307-16cf2a8e7e56";

  it("round-trips the application id", () => {
    expect(verifyReceipt(signReceipt(id))).toBe(id);
  });

  it("rejects tampering and expiry", () => {
    const receipt = signReceipt(id);
    expect(verifyReceipt(receipt.replace(id, "01a19c70-da80-7e9d-8307-16cf2a8e7e57"))).toBeNull();
    expect(verifyReceipt(`${receipt}x`)).toBeNull();
    expect(verifyReceipt("garbage")).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    expect(verifyReceipt(receipt)).toBeNull();
    vi.useRealTimers();
  });
});
