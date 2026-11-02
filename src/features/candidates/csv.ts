// Job-board CSV import (docs/02 M3-9, docs/01 §5.6): decode, parse, find the columns, and turn rows
// into candidates. Pure, so the browser can preview exactly what the server will import.

/** UTF-8 (with or without BOM) when the bytes are valid UTF-8, otherwise Shift_JIS. */
export function decodeCsv(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

/** RFC 4180: quoted fields, doubled quotes inside them, CRLF or LF line ends. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export type CsvColumns = {
  name?: number;
  lastName?: number;
  firstName?: number;
  email?: number;
  phone?: number;
  channel?: number;
  memo?: number;
};

const KANA = /カナ|かな|フリガナ|ふりがな|kana/i;
const PATTERNS: [keyof CsvColumns, RegExp][] = [
  ["email", /mail|メール/i],
  ["phone", /電話|携帯|tel|phone/i],
  ["channel", /応募経路|媒体|経路|source|channel/i],
  ["memo", /メモ|備考|memo|note/i],
  ["lastName", /^(姓|苗字|名字|last\s*name|family\s*name)$/i],
  ["firstName", /^(名|名前（名）|first\s*name|given\s*name)$/i],
  ["name", /氏名|名前|お名前|応募者|^name$|full\s*name/i],
];

/** Finds the columns by header text; reading (kana) columns are ignored. */
export function detectColumns(header: string[]): CsvColumns {
  const columns: CsvColumns = {};
  header.forEach((raw, index) => {
    const cell = raw.normalize("NFKC").trim();
    if (!cell || KANA.test(cell)) return;
    const match = PATTERNS.find(
      ([key, pattern]) => columns[key] === undefined && pattern.test(cell),
    );
    if (match) columns[match[0]] = index;
  });
  return columns;
}

export const hasNameColumn = (c: CsvColumns) =>
  c.name !== undefined || c.lastName !== undefined || c.firstName !== undefined;

export type CsvCandidate = {
  /** Line number in the file, counting the header as line 1. */
  row: number;
  name: string;
  email: string | null;
  phone: string | null;
  channel: string | null;
  memo: string | null;
};

/** Data rows as candidates; rows without a name are listed in `skipped` by line number. */
export function toCandidates(
  rows: string[][],
  columns: CsvColumns,
): { candidates: CsvCandidate[]; skipped: number[] } {
  const cell = (row: string[], index: number | undefined) => {
    const value = index === undefined ? "" : (row[index] ?? "").normalize("NFKC").trim();
    return value || null;
  };
  const candidates: CsvCandidate[] = [];
  const skipped: number[] = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const split = [cell(row, columns.lastName), cell(row, columns.firstName)]
      .filter(Boolean)
      .join(" ");
    const name = (cell(row, columns.name) ?? split).replace(/\s+/g, " ").trim();
    if (!name) {
      skipped.push(line);
      return;
    }
    candidates.push({
      row: line,
      name: name.slice(0, 50),
      email: cell(row, columns.email),
      phone: cell(row, columns.phone),
      channel: cell(row, columns.channel)?.slice(0, 30) ?? null,
      memo: cell(row, columns.memo)?.slice(0, 500) ?? null,
    });
  });
  return { candidates, skipped };
}
