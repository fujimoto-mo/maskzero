import { describe, expect, it } from "vitest";
import { decodeCsv, detectColumns, parseCsv, toCandidates } from "@/features/candidates/csv";

describe("CSV decoding", () => {
  it("reads UTF-8 with a BOM", () => {
    const bytes = new TextEncoder().encode("﻿氏名,メール\n山田 花子,a@example.test\n");
    expect(decodeCsv(bytes)).toBe("氏名,メール\n山田 花子,a@example.test\n");
  });

  it("falls back to Shift_JIS", () => {
    // 「氏名」 in Shift_JIS.
    const bytes = new Uint8Array([0x8e, 0x81, 0x96, 0xbc]);
    expect(decodeCsv(bytes)).toBe("氏名");
  });
});

describe("CSV parsing", () => {
  it("handles quotes, doubled quotes, commas and CRLF", () => {
    expect(parseCsv('a,"b,c","say ""hi"""\r\n1,2,3\r\n\r\n')).toEqual([
      ["a", "b,c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("keeps line breaks inside quoted fields", () => {
    expect(parseCsv('memo\n"line 1\nline 2"')).toEqual([["memo"], ["line 1\nline 2"]]);
  });
});

describe("column detection and rows", () => {
  it("finds columns by header, ignoring kana columns", () => {
    expect(
      detectColumns(["氏名（カナ）", "氏名", "メールアドレス", "電話番号", "応募経路", "備考"]),
    ).toEqual({
      name: 1,
      email: 2,
      phone: 3,
      channel: 4,
      memo: 5,
    });
  });

  it("joins split surname and given-name columns and skips rows without a name", () => {
    const rows = parseCsv(
      "姓,名,セイ,メイ,E-mail\n山田,花子,ヤマダ,ハナコ,ＨＡＮＡＫＯ@example.test\n,,,,x@example.test\n",
    );
    const columns = detectColumns(rows[0]!);
    expect(columns).toEqual({ lastName: 0, firstName: 1, email: 4 });
    const { candidates, skipped } = toCandidates(rows, columns);
    expect(candidates).toEqual([
      {
        row: 2,
        name: "山田 花子",
        email: "HANAKO@example.test",
        phone: null,
        channel: null,
        memo: null,
      },
    ]);
    expect(skipped).toEqual([3]);
  });
});
