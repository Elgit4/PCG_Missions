import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workspace = readFileSync(new URL('./StaffWorkspace.tsx', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../lib/theme.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../production.css', import.meta.url), 'utf8');

describe('staff workspace shell layout contract', () => {
  it('keeps the attribution in the desktop sidebar and out of the page footer', () => {
    const sidebar = workspace.match(/<aside className="cmi-sidebar">([\s\S]*?)<\/aside>/)?.[1] ?? '';
    expect(sidebar).toContain('cmi-sidebar-attribution');
    expect(workspace).not.toContain('cmi-footer');
    expect(workspace).not.toMatch(/<footer[\s>]/);
  });

  it('groups the mobile brand and workspace controls into one topbar', () => {
    const topbar = workspace.match(/<header className="cmi-topbar">([\s\S]*?)<\/header>/)?.[1] ?? '';
    expect(topbar).toContain('cmi-mobile-brand');
    expect(topbar).toContain('cmi-topbar-actions');
    expect(topbar).toContain('<ThemeToggle');
    expect(topbar).toContain('Refresh workspace');
    expect(theme).toContain('aria-pressed={theme === "dark"}');
    expect(theme).toContain('aria-label={nextLabel}');
  });

  it('preserves mobile bottom navigation and safe-area content clearance', () => {
    expect(workspace).toContain('className="cmi-mobile-nav"');
    expect(styles).toMatch(/\.cmi-content\s*\{[^}]*padding-bottom:[^}]*env\(safe-area-inset-bottom\)/s);
  });
});

it('keeps the current page title visible beneath the compact mobile brand row', () => {
  expect(styles).toMatch(/\.cmi-topbar-heading\s*\{\s*display:\s*contents/s);
  expect(styles).toMatch(/\.cmi-topbar-heading\s*>\s*h1\s*\{[^}]*display:\s*block/s);
});


it('expires the staff session when the task contact picker receives HTTP 401', () => {
  const pickerStart = workspace.indexOf(
    'api.listContacts(branchId, {',
    workspace.indexOf('debouncedTaskContactQuery'),
  );
  const pickerEnd = workspace.indexOf('const availablePages', pickerStart);
  const picker = workspace.slice(pickerStart, pickerEnd);
  expect(picker).toContain('error instanceof CmiApiError && error.status === 401');
  expect(picker).toContain('expireSession();');
});
