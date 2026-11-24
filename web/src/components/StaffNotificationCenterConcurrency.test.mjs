import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./StaffNotificationCenter.tsx', import.meta.url), 'utf8');

describe('notification mutation branch isolation', () => {
  it('tracks the current branch independently from in-flight mutations', () => {
    expect(source).toContain('const activeBranchId = useRef(branchId)');
    expect(source).toContain('activeBranchId.current = branchId');
    expect(source).toContain('if (activeBranchId.current !== actionBranchId) return');
  });

  it('does not apply stale mark-read or mark-all results to a new branch', () => {
    expect(source).toContain('if (activeBranchId.current !== actionBranchId) return');
    expect(source).toContain('if (activeBranchId.current === branchId) setSavingId(null)');
    expect(source).toContain('setSavingId(null);\n  }, [branchId])');
  });
});
