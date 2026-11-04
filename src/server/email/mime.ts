// An RFC 5322 message for the Gmail API (docs/02 M9-4): UTF-8 headers as encoded words, a
// base64 text body and optional attachments such as the interview's .ics.

export type MimeInput = {
  from: { name?: string | null; address: string };
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  attachments?: { filename: string; content: string; contentType: string }[];
  /** Fixed in tests; random otherwise. */
  boundary?: string;
  date?: Date;
};

const CRLF = "\r\n";
/** Bytes of UTF-8 per encoded word: 45 bytes → 60 base64 characters, within the 75 limit. */
const WORD_BYTES = 45;

/** Header text as UTF-8 encoded words (RFC 2047), split between characters, never inside one. */
export function encodeWords(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  const words: string[] = [];
  let chunk = "";
  for (const char of Array.from(value)) {
    if (Buffer.byteLength(chunk + char) > WORD_BYTES) {
      words.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words
    .map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`)
    .join(`${CRLF} `);
}

const base64Lines = (data: Buffer) => (data.toString("base64").match(/.{1,76}/g) ?? []).join(CRLF);

/** Strips line breaks so header values can't inject headers. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

function mailbox(name: string | null | undefined, address: string) {
  const clean = oneLine(address);
  return name ? `${encodeWords(oneLine(name).replace(/["\\]/g, ""))} <${clean}>` : clean;
}

export function buildMime(input: MimeInput): string {
  const headers = [
    `From: ${mailbox(input.from.name, input.from.address)}`,
    `To: ${oneLine(input.to)}`,
    ...(input.replyTo ? [`Reply-To: ${oneLine(input.replyTo)}`] : []),
    `Subject: ${encodeWords(oneLine(input.subject))}`,
    `Date: ${(input.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    "MIME-Version: 1.0",
  ];
  const textPart = [
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(Buffer.from(input.text, "utf8")),
  ];
  if (!input.attachments?.length) return [...headers, ...textPart].join(CRLF);

  const boundary =
    input.boundary ??
    `mask0-${Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString("hex")}`;
  const parts = [
    textPart.join(CRLF),
    ...input.attachments.map((a) =>
      [
        `Content-Type: ${oneLine(a.contentType)}; name="${oneLine(a.filename)}"`,
        `Content-Disposition: attachment; filename="${oneLine(a.filename)}"`,
        "Content-Transfer-Encoding: base64",
        "",
        base64Lines(Buffer.from(a.content, "base64")),
      ].join(CRLF),
    ),
  ];
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    ...parts.map((p) => `--${boundary}${CRLF}${p}`),
    `--${boundary}--`,
    "",
  ].join(CRLF);
}
