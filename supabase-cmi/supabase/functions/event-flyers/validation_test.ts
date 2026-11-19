import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isUuid, sniffImage, validateFlyerImage } from "./validation.ts";

Deno.test("accepts valid event UUIDs and rejects malformed IDs", () => {
  assertEquals(isUuid("10000000-0000-4000-8000-000000000001"), true);
  assertEquals(isUuid("not-a-uuid"), false);
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  view.setUint32(
    8 + data.length,
    crc32(chunk.subarray(4, 8 + data.length)),
  );
  return chunk;
}

function makePng(width: number, height: number) {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", new Uint8Array([0x78, 0x9c])),
    pngChunk("IEND", new Uint8Array()),
  ];
  const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  let offset = 8;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function makeJpeg(width: number, height: number) {
  const bytes = new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x08,
    0x01,
    0x01,
    0x00,
    0x00,
    0x3f,
    0x00,
    0x01,
    0xff,
    0xd9,
  ]);
  return bytes;
}

function webpChunk(type: string, data: Uint8Array) {
  const paddedLength = data.length + (data.length % 2);
  const chunk = new Uint8Array(8 + paddedLength);
  chunk.set(new TextEncoder().encode(type), 0);
  new DataView(chunk.buffer).setUint32(4, data.length, true);
  chunk.set(data, 8);
  return chunk;
}

function makeLosslessWebp(width: number, height: number) {
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  const imageHeader = new Uint8Array([
    0x2f,
    widthMinusOne & 0xff,
    ((widthMinusOne >> 8) & 0x3f) | ((heightMinusOne & 0x03) << 6),
    (heightMinusOne >> 2) & 0xff,
    (heightMinusOne >> 10) & 0x0f,
  ]);
  const chunk = webpChunk("VP8L", imageHeader);
  const bytes = new Uint8Array(12 + chunk.length);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(chunk, 12);
  return bytes;
}

Deno.test("accepts JPEGs only with frame dimensions and a scan segment", () => {
  assertEquals(sniffImage(makeJpeg(1200, 1600)), {
    mime: "image/jpeg",
    ext: "jpg",
  });
  assertEquals(sniffImage(makeJpeg(12000, 12000)), null);
  assertEquals(sniffImage(makeJpeg(0, 1600)), null);
  assertEquals(
    sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9])),
    null,
  );
});

Deno.test("accepts structurally complete PNGs with bounded dimensions", () => {
  assertEquals(sniffImage(makePng(1200, 1600)), {
    mime: "image/png",
    ext: "png",
  });
  assertEquals(sniffImage(makePng(0, 1600)), null);
  assertEquals(sniffImage(makePng(12000, 12000)), null);
  assertEquals(sniffImage(makePng(800, 600).slice(0, 24)), null);
});

Deno.test("accepts only complete WebP bitstreams with bounded dimensions", () => {
  assertEquals(sniffImage(makeLosslessWebp(800, 600)), {
    mime: "image/webp",
    ext: "webp",
  });
  assertEquals(sniffImage(makeLosslessWebp(12000, 12000)), null);
  assertEquals(sniffImage(makeLosslessWebp(0, 600)), null);

  const truncated = makeLosslessWebp(800, 600).slice(0, 12);
  assertEquals(sniffImage(truncated), null);

  const inconsistentLength = makeLosslessWebp(800, 600);
  new DataView(inconsistentLength.buffer).setUint32(
    4,
    inconsistentLength.length + 20,
    true,
  );
  assertEquals(sniffImage(inconsistentLength), null);
});

Deno.test("rejects PNG chunks with a corrupted CRC", () => {
  const bytes = makePng(1200, 1600);
  bytes[32] ^= 0x01;
  assertEquals(sniffImage(bytes), null);
});

Deno.test(
  "rejects declared MIME types that do not match the detected signature",
  () => {
    const png = makePng(1200, 1600);
    assertEquals(validateFlyerImage(png, "image/png"), {
      mime: "image/png",
      ext: "png",
    });
    assertEquals(validateFlyerImage(png, "image/jpeg"), null);
    assertEquals(validateFlyerImage(makeJpeg(1200, 1600), "image/webp"), null);
    assertEquals(
      validateFlyerImage(
        new TextEncoder().encode("not an image"),
        "image/png",
      ),
      null,
    );
  },
);

Deno.test("rejects unsupported image content", () => {
  assertEquals(sniffImage(new TextEncoder().encode("not an image")), null);
});
