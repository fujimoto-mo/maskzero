import "server-only";

// Uploaded files are judged by their bytes, never by the name or type the browser sent.

export type SniffedType = "application/pdf" | "image/jpeg" | "image/png";

export function sniffFileType(data: Buffer): SniffedType | null {
  if (data.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  return null;
}

/** Width and height from a PNG or JPEG header, or null if the file isn't one. */
export function imageSize(data: Buffer): { width: number; height: number } | null {
  const type = sniffFileType(data);
  if (type === "image/png" && data.length >= 24) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (type === "image/jpeg") {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) return null;
      const marker = data[offset + 1]!;
      const length = data.readUInt16BE(offset + 2);
      // SOF0–SOF15 carry the frame size, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}
