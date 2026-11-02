import { describe, expect, it } from "vitest";
import { greetingKey } from "@/lib/greeting";

// A moment at the given hour in Japan (UTC+9, no daylight saving time).
const atJstHour = (hour: number) => new Date(Date.UTC(2026, 10, 2, hour - 9, 30));

describe("greetingKey", () => {
  it.each([
    [4, "greetingMorning"],
    [10, "greetingMorning"],
    [11, "greetingDay"],
    [17, "greetingDay"],
    [18, "greetingEvening"],
    [0, "greetingEvening"],
    [3, "greetingEvening"],
  ])("greets at %i:30 JST with %s", (hour, key) => {
    expect(greetingKey(atJstHour(hour))).toBe(key);
  });
});
