export const FLYER_SIGNED_URL_SECONDS = 15 * 60;

export interface FlyerMetadata {
  objectPath: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
}

export interface FlyerReplacementOperations {
  createSignedPreview(objectPath: string): Promise<string>;
  saveMetadata(metadata: FlyerMetadata): Promise<void>;
  removeObject(objectPath: string): Promise<void>;
}

export interface FlyerReplacementResult {
  signedUrl: string;
  previousCleanupSucceeded: boolean;
}

/**
 * Attach a newly uploaded flyer without discarding the previous flyer until
 * the replacement preview and metadata update have both succeeded.
 */
export async function attachFlyerReplacement(
  newObjectPath: string,
  previousObjectPath: string | null,
  metadata: Omit<FlyerMetadata, "objectPath">,
  operations: FlyerReplacementOperations,
): Promise<FlyerReplacementResult> {
  let signedUrl: string;
  try {
    signedUrl = await operations.createSignedPreview(newObjectPath);
    await operations.saveMetadata({
      objectPath: newObjectPath,
      ...metadata,
    });
  } catch (error) {
    try {
      await operations.removeObject(newObjectPath);
    } catch {
      // Preserve the original failure. The caller logs the request ID and
      // returns a safe error; an orphan-cleanup process can reconcile storage.
    }
    throw error;
  }

  let previousCleanupSucceeded = true;
  if (previousObjectPath && previousObjectPath !== newObjectPath) {
    try {
      await operations.removeObject(previousObjectPath);
    } catch {
      previousCleanupSucceeded = false;
    }
  }

  return { signedUrl, previousCleanupSucceeded };
}
