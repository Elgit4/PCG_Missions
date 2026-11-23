import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = {
  staff: readFileSync(new URL('./StaffWorkspace.tsx', import.meta.url), 'utf8'),
  overview: readFileSync(new URL('./OverviewDashboard.tsx', import.meta.url), 'utf8'),
  operations: readFileSync(new URL('./OperationsWorkspace.tsx', import.meta.url), 'utf8'),
  teams: readFileSync(new URL('./TeamAdministrationWorkspace.tsx', import.meta.url), 'utf8'),
  reports: readFileSync(new URL('./MinistryReportsWorkspace.tsx', import.meta.url), 'utf8'),
  prayer: readFileSync(new URL('./PrayerRequestsWorkspace.tsx', import.meta.url), 'utf8'),
};

describe('staff workspace branch-label privacy', () => {
  it('keeps branch identifiers internal while retaining the staff workspace breadcrumb', () => {
    expect(files.staff).toContain('PCG MISSIONS / STAFF WORKSPACE');
    expect(files.staff).not.toContain('activeBranch?.name');
    expect(files.staff).not.toContain('branchName={activeBranch.name}');
  });

  it('does not render branch names in workspace headings or descriptions', () => {
    for (const [name, source] of Object.entries(files)) {
      expect(source, name).not.toContain('{branchName}');
      expect(source, name).not.toContain('branchName.toUpperCase()');
    }
  });
});
