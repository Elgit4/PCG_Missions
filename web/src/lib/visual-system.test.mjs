import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const stylesheet = readFileSync(new URL('../../production.css', import.meta.url), 'utf8');
describe('PCG Missions visual system', () => {
 it('defines semantic light and dark tokens', () => {
  expect(stylesheet).toContain(':root');
  expect(stylesheet).toContain('html[data-theme="dark"]');
  for (const token of ['--cmi-bg','--cmi-surface','--cmi-text','--cmi-muted','--cmi-border','--cmi-primary','--cmi-brand-accent','--cmi-success','--cmi-warning','--cmi-danger','--cmi-focus']) expect(stylesheet).toContain(token);
 });
 it('keeps selected navigation away from error red', () => {
  const active = stylesheet.match(/\.cmi-nav button\.active\s*\{([^}]*)\}/)?.[1] ?? '';
  expect(active).not.toMatch(/--cmi-danger|#(?:c9|b9|a9)\w{4}/i);
  expect(stylesheet).toMatch(/\.cmi-alert/);
  expect(stylesheet).toMatch(/\.cmi-button-danger/);
 });
 it('uses readable data-entry sizes and visible focus', () => {
  expect(stylesheet).toMatch(/\.cmi-form-grid input/);
  expect(stylesheet).toMatch(/min-height:\s*(44|4[6-9]|5\d)px/);
  expect(stylesheet).toMatch(/font-size:\s*(14|15|16)px/);
  expect(stylesheet).toMatch(/:focus-visible/);
 });
});
