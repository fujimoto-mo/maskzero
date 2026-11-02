import { describe, expect, it } from "vitest";
import { imageSize, sniffFileType } from "@/server/files";

// A 1×1 PNG and a minimal JPEG header with a 640×480 SOF0 frame.
const png = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082",
  "hex",
);
const jpeg = Buffer.from([
  0xff,
  0xd8,
  0xff,
  0xe0,
  0x00,
  0x10,
  ...Buffer.from("JFIF\0"),
  0x01,
  0x01,
  0x00,
  0x00,
  0x01,
  0x00,
  0x01,
  0x00,
  0x00,
  0xff,
  0xc0,
  0x00,
  0x11,
  0x08,
  0x01,
  0xe0,
  0x02,
  0x80,
  0x03,
  0x01,
  0x22,
  0x00,
  0x02,
  0x11,
  0x01,
  0x03,
  0x11,
  0x01,
]);

describe("file sniffing", () => {
  it("recognizes PDF, JPEG and PNG by their bytes", () => {
    expect(sniffFileType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffFileType(jpeg)).toBe("image/jpeg");
    expect(sniffFileType(png)).toBe("image/png");
    expect(sniffFileType(Buffer.from("<html>"))).toBeNull();
  });

  it("reads image dimensions from the header", () => {
    expect(imageSize(png)).toEqual({ width: 1, height: 1 });
    expect(imageSize(jpeg)).toEqual({ width: 640, height: 480 });
    expect(imageSize(Buffer.from("%PDF-1.7"))).toBeNull();
  });
});
