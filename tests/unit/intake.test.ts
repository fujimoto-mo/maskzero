import { describe, expect, it } from "vitest";
import { KNOWN_CHANNELS, normalizeChannel } from "@/features/intake/channels";
import {
  checkEntryTemplate,
  DEFAULT_ENTRY_TEMPLATE,
  renderEntryMessage,
} from "@/features/intake/template";

describe("entry channels", () => {
  it("lists the 22 job boards", () => {
    expect(KNOWN_CHANNELS).toHaveLength(22);
    expect(new Set(KNOWN_CHANNELS).size).toBe(22);
  });

  it("maps typed names onto known boards and keeps custom names", () => {
    expect(normalizeChannel(" indeed ")).toBe("Indeed");
    expect(normalizeChannel("ＤＯＤＡ")).toBe("doda");
    expect(normalizeChannel("地域の  求人誌")).toBe("地域の 求人誌");
    expect(normalizeChannel("   ")).toBeNull();
    expect(normalizeChannel("あ".repeat(31))).toBeNull();
  });
});

describe("auto-reply template", () => {
  it("requires {URL}", () => {
    expect(checkEntryTemplate(DEFAULT_ENTRY_TEMPLATE)).toBeNull();
    expect(checkEntryTemplate("ご応募ありがとうございます。")).toBe("missingUrl");
    expect(checkEntryTemplate(`{URL}${"あ".repeat(2000)}`)).toBe("tooLong");
  });

  it("fills in every {URL} and {JOB}", () => {
    expect(
      renderEntryMessage("{JOB}：{URL}\n再掲 {URL}", {
        url: "https://x.test/a/abc",
        jobTitle: "営業",
      }),
    ).toBe("営業：https://x.test/a/abc\n再掲 https://x.test/a/abc");
  });
});
