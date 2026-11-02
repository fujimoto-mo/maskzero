import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine } from "@/features/scheduling/ics";
import {
  type AvailabilityRules,
  formatSlot,
  freeSlots,
  hoursOn,
  isFree,
  jstInstant,
  outsideQuietHours,
  reminderAt,
  ruleSlotsOn,
} from "@/features/scheduling/slots";
import {
  DEFAULT_TEMPLATES,
  renderTemplate,
  TRIGGERS,
  validateTemplate,
} from "@/features/scheduling/templates";

const rules: AvailabilityRules = {
  weekly: {},
  commonFrom: "10:00",
  commonTo: "18:00",
  slotMinutes: 60,
  bufferMinutes: 0,
  excludeWeekends: true,
  excludeHolidays: true,
  windowDays: 42,
  minNoticeHours: 24,
};
const at = (local: string) => new Date(`${local}+09:00`);
const starts = (slots: { startsAt: Date }[]) => slots.map((s) => s.startsAt.toISOString());

describe("opening hours", () => {
  it("closes weekends, Japanese public holidays and weekdays switched off", () => {
    expect(hoursOn(rules, "2026-11-07")).toBeNull(); // Saturday
    expect(hoursOn(rules, "2026-11-03")).toBeNull(); // 文化の日
    expect(hoursOn(rules, "2026-11-04")).toEqual({ from: "10:00", to: "18:00" });
    const custom = {
      ...rules,
      weekly: {
        "3": { on: false, from: "10:00", to: "18:00" },
        "4": { on: true, from: "13:00", to: "17:00" },
      },
    };
    expect(hoursOn(custom, "2026-11-04")).toBeNull(); // Wednesday off
    expect(hoursOn(custom, "2026-11-05")).toEqual({ from: "13:00", to: "17:00" });
  });

  it("steps the grid by slot plus buffer and never runs past closing time", () => {
    expect(ruleSlotsOn(rules, "2026-11-04")).toHaveLength(8);
    const buffered = ruleSlotsOn({ ...rules, bufferMinutes: 15 }, "2026-11-04");
    expect(buffered.map((s) => s.startsAt.toISOString())).toEqual(
      ["10:00", "11:15", "12:30", "13:45", "15:00", "16:15"].map((t) =>
        jstInstant("2026-11-04", t).toISOString(),
      ),
    );
    // A 90-minute later round fits seven starts on the hourly grid.
    expect(ruleSlotsOn(rules, "2026-11-04", 90)).toHaveLength(7);
  });
});

describe("free slots", () => {
  const now = at("2026-11-02T10:00:00"); // Monday

  it("respects the minimum notice, skips the holiday and stops at the window edge", () => {
    const free = freeSlots({ rules, overrides: [], busy: [], now });
    // 24 hours' notice reaches the 3rd, which is a holiday: the first slot is on the 4th.
    expect(free[0]!.startsAt).toEqual(at("2026-11-04T10:00:00"));
    // 42 days after 11/2 is Monday 12/14, across a month boundary.
    expect(free.at(-1)!.startsAt).toEqual(at("2026-12-14T17:00:00"));
    expect(starts(free)).toContain(at("2026-12-01T10:00:00").toISOString());
  });

  it("removes slots overlapping bookings, including the buffer around them", () => {
    const busy = [{ startsAt: at("2026-11-04T11:45:00"), endsAt: at("2026-11-04T12:45:00") }];
    const free = freeSlots({ rules: { ...rules, bufferMinutes: 30 }, overrides: [], busy, now });
    const day = starts(free.filter((s) => s.startsAt < at("2026-11-05T00:00:00")));
    // Grid every 90 minutes: 10:00, 11:30, 13:00, 14:30, 16:00. 11:30 and 13:00 touch the booking.
    expect(day).toEqual(
      ["10:00", "14:30", "16:00"].map((t) => jstInstant("2026-11-04", t).toISOString()),
    );
  });

  it("adds slots opened by hand and drops slots closed by hand", () => {
    const overrides = [
      { startsAt: at("2026-11-07T10:00:00"), open: true }, // a Saturday
      { startsAt: at("2026-11-04T10:00:00"), open: false },
    ];
    const free = freeSlots({ rules, overrides, busy: [], now });
    expect(starts(free)).toContain(at("2026-11-07T10:00:00").toISOString());
    expect(starts(free)).not.toContain(at("2026-11-04T10:00:00").toISOString());
    expect(
      isFree({ startsAt: at("2026-11-07T10:00:00"), endsAt: at("2026-11-07T11:00:00") }, free),
    ).toBe(true);
    expect(
      isFree({ startsAt: at("2026-11-07T10:00:00"), endsAt: at("2026-11-07T11:30:00") }, free),
    ).toBe(false);
  });
});

describe("send times", () => {
  it("defers sends in quiet hours to 08:00", () => {
    expect(outsideQuietHours(at("2026-11-04T22:30:00"))).toEqual(at("2026-11-05T08:00:00"));
    expect(outsideQuietHours(at("2026-11-04T06:00:00"))).toEqual(at("2026-11-04T08:00:00"));
    expect(outsideQuietHours(at("2026-11-04T12:00:00"))).toEqual(at("2026-11-04T12:00:00"));
  });

  it("reminds at 18:00 the day before, unless that has passed", () => {
    expect(reminderAt(at("2026-11-05T14:00:00"), at("2026-11-02T10:00:00"))).toEqual(
      at("2026-11-04T18:00:00"),
    );
    expect(reminderAt(at("2026-11-05T14:00:00"), at("2026-11-04T19:00:00"))).toBeNull();
  });

  it("formats slots in Japan time", () => {
    expect(
      formatSlot({ startsAt: at("2026-11-04T10:00:00"), endsAt: at("2026-11-04T11:00:00") }),
    ).toBe("11月4日（水）10:00〜11:00");
  });
});

describe("iCalendar", () => {
  it("escapes text and folds long lines without splitting characters", () => {
    expect(escapeText("面接; 1次, オンライン\n持ち物なし")).toBe(
      "面接\\; 1次\\, オンライン\\n持ち物なし",
    );
    const folded = foldLine(`DESCRIPTION:${"あ".repeat(60)}`);
    for (const line of folded.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"あ".repeat(60)}`);
  });

  it("builds a calendar entry with UTC times and CRLF line ends", () => {
    const ics = buildIcs({
      uid: "interview-1@mask0",
      startsAt: at("2026-11-04T10:00:00"),
      endsAt: at("2026-11-04T11:00:00"),
      summary: "面接（法人営業）",
      description: "オンライン面接",
      url: "https://meet.example.test/abc",
      now: at("2026-11-02T10:00:00"),
    });
    expect(ics).toContain("DTSTART:20261104T010000Z\r\n");
    expect(ics).toContain("DTEND:20261104T020000Z\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("email templates", () => {
  it("ships valid defaults for every trigger", () => {
    for (const trigger of TRIGGERS)
      expect(validateTemplate(trigger, DEFAULT_TEMPLATES[trigger])).toEqual([]);
  });

  it("reports unknown fields, missing required fields and blanks", () => {
    expect(validateTemplate("pass", { subject: "件名", body: "{name} 様 {bookign_url}" })).toEqual([
      { code: "unknownField", field: "bookign_url" },
      { code: "missingField", field: "booking_url" },
    ]);
    expect(validateTemplate("rejection", { subject: " ", body: "x" })).toEqual([{ code: "empty" }]);
  });

  it("fills in fields and never leaves a placeholder behind", () => {
    const { subject, body } = renderTemplate(DEFAULT_TEMPLATES.pass, {
      name: "山田 花子",
      company: "テスト商事",
      job: "法人営業",
      booking_url: "https://app.test/p/abc/book",
    });
    expect(subject).toBe("【テスト商事】書類選考の結果と面接日程のご案内");
    expect(body).toContain("山田 花子 様");
    expect(body).toContain("https://app.test/p/abc/book");
    expect(body).not.toMatch(/\{[a-z_]+\}/);
  });
});
