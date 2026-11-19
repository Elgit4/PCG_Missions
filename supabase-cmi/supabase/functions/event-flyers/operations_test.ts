import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  attachFlyerReplacement,
  FLYER_SIGNED_URL_SECONDS,
  type FlyerMetadata,
  type FlyerReplacementOperations,
} from "./operations.ts";

function fakeOperations(
  calls: string[],
  options: {
    failSigning?: boolean;
    failMetadata?: boolean;
    failRemovalFor?: string;
    onRollbackCleanupFailure?: () => void;
  } = {},
): FlyerReplacementOperations {
  return {
    async createSignedPreview(objectPath) {
      calls.push(`sign:${objectPath}`);
      if (options.failSigning) throw new Error("SIGNING_FAILED");
      return `https://signed.example/${objectPath}`;
    },
    async saveMetadata(metadata: FlyerMetadata) {
      calls.push(`save:${metadata.objectPath}`);
      if (options.failMetadata) throw new Error("METADATA_FAILED");
    },
    async removeObject(objectPath) {
      calls.push(`remove:${objectPath}`);
      if (options.failRemovalFor === objectPath) {
        throw new Error("CLEANUP_FAILED");
      }
    },
    onRollbackCleanupFailure: options.onRollbackCleanupFailure,
  };
}

Deno.test(
  "signed flyer previews expire after fifteen minutes",
  () => {
    assertEquals(FLYER_SIGNED_URL_SECONDS, 900);
  },
);

Deno.test(
  "replacement saves metadata before removing the previous flyer",
  async () => {
    const calls: string[] = [];
    const result = await attachFlyerReplacement(
      "branch/event/new.webp",
      "branch/event/old.jpg",
      { mimeType: "image/webp", sizeBytes: 1200 },
      fakeOperations(calls),
    );

    assertEquals(calls, [
      "sign:branch/event/new.webp",
      "save:branch/event/new.webp",
      "remove:branch/event/old.jpg",
    ]);
    assertEquals(result, {
      signedUrl: "https://signed.example/branch/event/new.webp",
      previousCleanupSucceeded: true,
    });
  },
);

Deno.test(
  "signing failure removes the new upload and preserves the previous flyer",
  async () => {
    const calls: string[] = [];
    let failed = false;
    try {
      await attachFlyerReplacement(
        "branch/event/new.webp",
        "branch/event/old.jpg",
        { mimeType: "image/webp", sizeBytes: 1200 },
        fakeOperations(calls, { failSigning: true }),
      );
    } catch (error) {
      failed = error instanceof Error && error.message === "SIGNING_FAILED";
    }

    assertEquals(failed, true);
    assertEquals(calls, [
      "sign:branch/event/new.webp",
      "remove:branch/event/new.webp",
    ]);
  },
);

Deno.test(
  "metadata failure removes the new upload and preserves the previous flyer",
  async () => {
    const calls: string[] = [];
    let failed = false;
    try {
      await attachFlyerReplacement(
        "branch/event/new.webp",
        "branch/event/old.jpg",
        { mimeType: "image/webp", sizeBytes: 1200 },
        fakeOperations(calls, { failMetadata: true }),
      );
    } catch (error) {
      failed = error instanceof Error && error.message === "METADATA_FAILED";
    }

    assertEquals(failed, true);
    assertEquals(calls, [
      "sign:branch/event/new.webp",
      "save:branch/event/new.webp",
      "remove:branch/event/new.webp",
    ]);
  },
);

Deno.test(
  "previous-flyer cleanup failure is reported without discarding the replacement",
  async () => {
    const calls: string[] = [];
    const result = await attachFlyerReplacement(
      "branch/event/new.webp",
      "branch/event/old.jpg",
      { mimeType: "image/webp", sizeBytes: 1200 },
      fakeOperations(calls, { failRemovalFor: "branch/event/old.jpg" }),
    );

    assertEquals(
      result.signedUrl,
      "https://signed.example/branch/event/new.webp",
    );
    assertEquals(result.previousCleanupSucceeded, false);
    assertEquals(calls, [
      "sign:branch/event/new.webp",
      "save:branch/event/new.webp",
      "remove:branch/event/old.jpg",
    ]);
  },
);

Deno.test(
  "initial flyer attachment does not attempt previous-object cleanup",
  async () => {
    const calls: string[] = [];
    const result = await attachFlyerReplacement(
      "branch/event/new.webp",
      null,
      { mimeType: "image/webp", sizeBytes: 1200 },
      fakeOperations(calls),
    );

    assertEquals(result.previousCleanupSucceeded, true);
    assertEquals(calls, [
      "sign:branch/event/new.webp",
      "save:branch/event/new.webp",
    ]);
  },
);

Deno.test(
  "rollback cleanup failure is surfaced to the request logger",
  async () => {
    const calls: string[] = [];
    let cleanupFailureReported = false;
    try {
      await attachFlyerReplacement(
        "branch/event/new.webp",
        "branch/event/old.jpg",
        { mimeType: "image/webp", sizeBytes: 1200 },
        fakeOperations(calls, {
          failMetadata: true,
          failRemovalFor: "branch/event/new.webp",
          onRollbackCleanupFailure: () => {
            cleanupFailureReported = true;
          },
        }),
      );
    } catch {
      // The metadata failure remains the primary failure.
    }

    assertEquals(cleanupFailureReported, true);
    assertEquals(calls, [
      "sign:branch/event/new.webp",
      "save:branch/event/new.webp",
      "remove:branch/event/new.webp",
    ]);
  },
);
