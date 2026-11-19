import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isUuid, sniffImage } from "./validation.ts";

Deno.test("accepts valid event UUIDs and rejects malformed IDs", () => {
  assertEquals(isUuid("10000000-0000-4000-8000-000000000001"), true);
  assertEquals(isUuid("not-a-uuid"), false);
});

Deno.test("accepts JPEG only when the image markers are present", () => {
  assertEquals(
    sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9])),
    mime: "image/jpeg",
    ext: "jpg",
  });
  assertEquals(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), null);
});

Deno.test(
  "accepts bounded PNG dimensions and rejects zero or oversized images",
  () => {
  const makePngHeader = (width: number, height: number) => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    bytes.set([73, 72, 68, 82], 12);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, width);
    view.setUint32(20, height);
    return bytes;
  };
  assertEquals(sniffImage(makePngHeader(1200, 1600)), {
    mime: "image/png",
    ext: "png",
  });
  assertEquals(sniffImage(makePngHeader(0, 1600)), null);
  assertEquals(sniffImage(makePngHeader(12000, 12000)), null);
});

Deno.test("accepts only structurally consistent WebP RIFF headers", () => {
  const bytes = new Uint8Array(12);
  bytes.set([82, 73, 70, 70], 0);
  new DataView(bytes.buffer).setUint32(4, 4, true);
  bytes.set([87, 69, 66, 80], 8);
  assertEquals(sniffImage(bytes), { mime: "image/webp", ext: "webp" });
  new DataView(bytes.buffer).setUint32(4, 99, true);
  assertEquals(sniffImage(bytes), null);
});

Deno.test("rejects unsupported image content", () => {
  assertEquals(sniffImage(new TextEncoder().encode("not an image")), null);
});
