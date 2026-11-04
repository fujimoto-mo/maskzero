import { describe, expect, it } from "vitest";
import { buildMime, encodeWords } from "@/server/email/mime";

// Gmail "send as" (docs/02 M9-4) sends a raw RFC 5322 message we build ourselves.

const decodeWords = (header: string) =>
  header
    .split(/\r\n /)
    .map((w) => Buffer.from(w.replace(/^=\?UTF-8\?B\?|\?=$/g, ""), "base64").toString("utf8"))
    .join("");

describe("MIME for Gmail", () => {
  it("encodes Japanese headers as UTF-8 words that stay within the line limit", () => {
    expect(encodeWords("Interview")).toBe("Interview");
    const subject =
      "【面接日時のご案内】営業職（正社員）の一次面接について、ご確認をお願いいたします";
    const encoded = encodeWords(subject);
    for (const word of encoded.split("\r\n ")) {
      expect(word.length).toBeLessThanOrEqual(75);
      expect(word).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    }
    expect(decodeWords(encoded)).toBe(subject);
  });

  it("never splits a character across encoded words", () => {
    const value = "🙂".repeat(30);
    expect(decodeWords(encodeWords(value))).toBe(value);
  });

  it("builds a plain message whose body decodes to the text", () => {
    const mime = buildMime({
      from: { name: "サンプル商事 採用担当", address: "saiyo@example.com" },
      to: "taro@example.com",
      subject: "面接のご案内",
      text: "こんにちは。\n面接は10日です。",
      date: new Date("2026-11-04T01:00:00Z"),
    });
    const [head, body] = mime.split("\r\n\r\n");
    expect(head).toContain("To: taro@example.com");
    expect(head).toContain("<saiyo@example.com>");
    expect(head).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(head).not.toContain("Reply-To");
    expect(Buffer.from(body!.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe(
      "こんにちは。\n面接は10日です。",
    );
  });

  it("keeps header values on one line, so nothing can add headers", () => {
    const mime = buildMime({
      from: { address: "saiyo@example.com" },
      to: "a@example.com\r\nBcc: victim@example.com",
      replyTo: "reply@example.com",
      subject: "hello\r\nBcc: victim@example.com",
      text: "x",
    });
    expect(mime.split("\r\n").filter((line) => line.startsWith("Bcc:"))).toEqual([]);
    expect(mime).toContain("Reply-To: reply@example.com");
  });

  it("attaches files in a multipart message", () => {
    const ics = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";
    const mime = buildMime({
      from: { address: "saiyo@example.com" },
      to: "a@example.com",
      subject: "s",
      text: "t",
      boundary: "b0",
      attachments: [
        {
          filename: "interview.ics",
          contentType: "text/calendar; charset=utf-8; method=PUBLISH",
          content: Buffer.from(ics).toString("base64"),
        },
      ],
    });
    expect(mime).toContain('Content-Type: multipart/mixed; boundary="b0"');
    expect(mime.match(/^--b0$/gm)).toHaveLength(2);
    expect(mime).toContain('Content-Disposition: attachment; filename="interview.ics"');
    expect(mime.trimEnd().endsWith("--b0--")).toBe(true);
  });
});
