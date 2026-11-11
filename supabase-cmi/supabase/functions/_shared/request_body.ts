export const DEFAULT_MAX_REQUEST_BODY_BYTES = 32 * 1024;

export async function readJson(
  request: Request,
  maxBytes = DEFAULT_MAX_REQUEST_BODY_BYTES,
): Promise<unknown> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("INVALID_BODY_LIMIT");
  }

  const contentType = request.headers.get("Content-Type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new Error("CONTENT_TYPE_REQUIRED");
  }

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength.trim())) {
      throw new Error("INVALID_CONTENT_LENGTH");
    }
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength > maxBytes) {
      throw new Error("BODY_TOO_LARGE");
    }
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("REQUEST_BODY_REQUIRED");

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) throw new Error("REQUEST_BODY_REQUIRED");
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(decoded) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}
