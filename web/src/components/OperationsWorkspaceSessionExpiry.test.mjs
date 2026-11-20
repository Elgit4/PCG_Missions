import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./OperationsWorkspace.tsx', import.meta.url), 'utf8');

describe('operations mutation session expiry', () => {
  it('routes flyer removal and event registration state 401 responses through session expiry', () => {
    const guarded = source.match(/if \(cause instanceof CmiApiError && cause\.status === 401\) onSessionExpired\(\);/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(3);
  });
});
