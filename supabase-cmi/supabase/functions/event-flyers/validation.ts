export type FlyerImage = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
};

const MAX_DIMENSION = 12_000;
const MAX_PIXELS = 40_000_000;
const JPEG_SOF_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function boundedDimensions(width: number, height: number) {
  return Number.isInteger(width) && Number.isInteger(height) &&
    width > 0 && height > 0 &&
    width <= MAX_DIMENSION && height <= MAX_DIMENSION &&
    width * height <= MAX_PIXELS;
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] * 0x1000000) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16);
}

function readUint32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

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

function hasAscii(bytes: Uint8Array, offset: number, value: string) {
  return value.split("").every((character, index) =>
    bytes[offset + index] === character.charCodeAt(0)
  );
}

function sniffPng(bytes: Uint8Array): FlyerImage | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (
    bytes.length < 45 ||
    !signature.every((value, index) => bytes[index] === value)
  ) {
    return null;
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let firstChunk = true;
  let hasImageData = false;
  let hasEnd = false;

  while (offset + 12 <= bytes.length) {
    const chunkLength = readUint32BE(bytes, offset);
    const dataStart = offset + 8;
    const chunkEnd = dataStart + chunkLength;
    const nextOffset = chunkEnd + 4;

    if (nextOffset > bytes.length) return null;

    const storedCrc = readUint32BE(bytes, chunkEnd);
    const calculatedCrc = crc32(bytes.subarray(offset + 4, chunkEnd));
    if (storedCrc !== calculatedCrc) return null;

    if (firstChunk) {
      if (chunkLength !== 13 || !hasAscii(bytes, offset + 4, "IHDR")) {
        return null;
      }
      width = readUint32BE(bytes, dataStart);
      height = readUint32BE(bytes, dataStart + 4);
      if (
        !boundedDimensions(width, height) ||
        bytes[dataStart + 10] !== 0 ||
        bytes[dataStart + 11] !== 0 ||
        bytes[dataStart + 12] > 1
      ) {
        return null;
      }
      firstChunk = false;
    } else if (hasAscii(bytes, offset + 4, "IHDR")) {
      return null;
    }

    if (hasAscii(bytes, offset + 4, "IDAT")) {
      if (chunkLength < 1) return null;
      hasImageData = true;
    }

    if (hasAscii(bytes, offset + 4, "IEND")) {
      if (chunkLength !== 0) return null;
      hasEnd = true;
      offset = nextOffset;
      break;
    }

    offset = nextOffset;
  }

  if (!hasImageData || !hasEnd || offset !== bytes.length) return null;
  return { mime: "image/png", ext: "png" };
}

function sniffJpeg(bytes: Uint8Array): FlyerImage | null {
  if (
    bytes.length < 20 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    return null;
  }

  let offset = 2;
  let dimensionsValid = false;
  let scanFound = false;

  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length - 2) return null;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) break;
    if (marker === 0x00) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length - 2) return null;

    const segmentLength = readUint16BE(bytes, offset);
    if (
      segmentLength < 2 ||
      offset + segmentLength > bytes.length - 2
    ) {
      return null;
    }

    if (marker === 0xda) {
      const dataStart = offset + 2;
      if (
        segmentLength < 6 ||
        dataStart >= bytes.length - 2
      ) {
        return null;
      }
      const componentCount = bytes[dataStart];
      if (
        componentCount < 1 ||
        segmentLength < 6 + 2 * componentCount
      ) {
        return null;
      }
      scanFound = true;
      break;
    }

    if (JPEG_SOF_MARKERS.has(marker)) {
      const dataStart = offset + 2;
      if (segmentLength < 11) return null;
      const height = readUint16BE(bytes, dataStart + 1);
      const width = readUint16BE(bytes, dataStart + 3);
      const componentCount = bytes[dataStart + 5];
      if (
        componentCount < 1 ||
        segmentLength < 8 + 3 * componentCount ||
        !boundedDimensions(width, height)
      ) {
        return null;
      }
      dimensionsValid = true;
    }

    offset += segmentLength;
  }

  if (!dimensionsValid || !scanFound) return null;
  return { mime: "image/jpeg", ext: "jpg" };
}

function sniffWebp(bytes: Uint8Array): FlyerImage | null {
  if (
    bytes.length < 26 ||
    !hasAscii(bytes, 0, "RIFF") ||
    !hasAscii(bytes, 8, "WEBP") ||
    readUint32LE(bytes, 4) !== bytes.length - 8
  ) {
    return null;
  }

  let offset = 12;
  let canvasDimensionsValid = true;
  let hasImageBitstream = false;

  while (offset + 8 <= bytes.length) {
    const chunkType = String.fromCharCode(...bytes.slice(offset, offset + 4));
    const chunkLength = readUint32LE(bytes, offset + 4);
    const dataStart = offset + 8;
    const chunkEnd = dataStart + chunkLength;
    const nextOffset = chunkEnd + (chunkLength % 2);

    if (chunkEnd > bytes.length || nextOffset > bytes.length) return null;

    if (chunkType === "VP8X") {
      if (chunkLength < 10) return null;
      const width = 1 + readUint24LE(bytes, dataStart + 4);
      const height = 1 + readUint24LE(bytes, dataStart + 7);
      canvasDimensionsValid = boundedDimensions(width, height);
      if (!canvasDimensionsValid) return null;
    } else if (chunkType === "VP8 ") {
      if (
        chunkLength < 10 ||
        bytes[dataStart + 3] !== 0x9d ||
        bytes[dataStart + 4] !== 0x01 ||
        bytes[dataStart + 5] !== 0x2a
      ) {
        return null;
      }
      const width = readUint16LE(bytes, dataStart + 6) & 0x3fff;
      const height = readUint16LE(bytes, dataStart + 8) & 0x3fff;
      if (!boundedDimensions(width, height)) return null;
      hasImageBitstream = true;
    } else if (chunkType === "VP8L") {
      if (chunkLength < 5 || bytes[dataStart] !== 0x2f) return null;
      const widthMinusOne = bytes[dataStart + 1] |
        ((bytes[dataStart + 2] & 0x3f) << 8);
      const heightMinusOne = (bytes[dataStart + 2] >> 6) |
        (bytes[dataStart + 3] << 2) |
        ((bytes[dataStart + 4] & 0x0f) << 10);
      const width = widthMinusOne + 1;
      const height = heightMinusOne + 1;
      if (!boundedDimensions(width, height)) return null;
      hasImageBitstream = true;
    }

    offset = nextOffset;
  }

  if (
    offset !== bytes.length ||
    !canvasDimensionsValid ||
    !hasImageBitstream
  ) {
    return null;
  }
  return { mime: "image/webp", ext: "webp" };
}

export function sniffImage(bytes: Uint8Array): FlyerImage | null {
  if (
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8
  ) {
    return sniffJpeg(bytes);
  }
  if (bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80) {
    return sniffPng(bytes);
  }
  if (bytes.length >= 12 && hasAscii(bytes, 0, "RIFF")) {
    return sniffWebp(bytes);
  }
  return null;
}

export function validateFlyerImage(
  bytes: Uint8Array,
  declaredMimeType: string,
): FlyerImage | null {
  const detected = sniffImage(bytes);
  return detected?.mime === declaredMimeType ? detected : null;
}
