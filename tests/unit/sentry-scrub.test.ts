import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "@/lib/sentry";

const event = (fields: Record<string, unknown>) => ({ type: undefined, ...fields }) as ErrorEvent;

describe("scrubEvent", () => {
  it("masks emails and Japanese phone numbers anywhere in the event", () => {
    const out = JSON.stringify(
      scrubEvent(
        event({
          message: "failed for tanaka@example.co.jp",
          exception: { values: [{ value: "call 090-1234-5678 or +81 3-1234-5678 or 0312345678" }] },
          extra: { nested: [{ email: "a.b+test@mask0.example" }] },
        }),
      ),
    );
    expect(out).not.toMatch(/tanaka@|090-1234|1234-5678|0312345678|a\.b\+test@/);
    expect(out).toContain("[email]");
    expect(out).toContain("[phone]");
  });

  it("keeps IDs, paths and timings readable", () => {
    const message =
      "application 0195f000-0000-7000-8000-000000000001 failed on /app/demo/main/dashboard after 1200ms";
    expect(scrubEvent(event({ message })).message).toBe(message);
  });
});
