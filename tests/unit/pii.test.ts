import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubEnv("PII_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
});

const load = () => import("@/server/crypto/pii");

describe("PII encryption", () => {
  it("round-trips Japanese text and uses a fresh IV each time", async () => {
    const { decryptPii, encryptPii } = await load();
    const a = encryptPii("山田 花子 <hanako@example.co.jp>");
    const b = encryptPii("山田 花子 <hanako@example.co.jp>");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(decryptPii(a)).toBe("山田 花子 <hanako@example.co.jp>");
  });

  it("rejects tampered ciphertext", async () => {
    const { decryptPii, encryptPii } = await load();
    const value = encryptPii("090-1234-5678");
    const tampered = `${value.slice(0, -4)}AAAA`;
    expect(() => decryptPii(tampered)).toThrow();
  });
});

describe("normalization and hashing", () => {
  it.each([
    ["090-1234-5678", "09012345678"],
    ["０９０ １２３４ ５６７８", "09012345678"],
    ["+81 90-1234-5678", "09012345678"],
    ["(03) 1234-5678", "0312345678"],
  ])("normalizes phone %j", async (raw, expected) => {
    const { normalizePhone } = await load();
    expect(normalizePhone(raw)).toBe(expected);
  });

  it("hashes the same email the same way regardless of case and spacing", async () => {
    const { protectContact } = await load();
    const a = protectContact("email", "  Hanako@Example.co.jp ");
    const b = protectContact("email", "hanako@example.co.jp");
    expect(a.hash).toBe(b.hash);
    expect(a.enc).not.toBe(b.enc);
  });

  it("returns nulls for blank contacts", async () => {
    const { protectContact } = await load();
    expect(protectContact("phone", "  ")).toEqual({ enc: null, hash: null });
  });
});
