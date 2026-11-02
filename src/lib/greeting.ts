export type GreetingKey = "greetingMorning" | "greetingDay" | "greetingEvening";

const tokyoHour = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "Asia/Tokyo",
});

/** Time-of-day greeting in Japan time: 04:00–10:59 morning, 11:00–17:59 day, otherwise evening. */
export function greetingKey(now: Date): GreetingKey {
  const hour = Number(tokyoHour.format(now));
  if (hour >= 4 && hour < 11) return "greetingMorning";
  if (hour >= 11 && hour < 18) return "greetingDay";
  return "greetingEvening";
}
