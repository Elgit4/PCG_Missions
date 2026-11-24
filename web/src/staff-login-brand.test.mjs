import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../production.css', import.meta.url), 'utf8');

describe('staff login brand accents', () => {
  it('uses the muted-gold brand accent for normal emphasis and access markers', () => {
    expect(stylesheet).toMatch(/\.staff-login-overline span\s*\{[^}]*background:\s*var\(--cmi-brand-accent\)/s);
    expect(stylesheet).toMatch(/\.staff-login-aside-content h1 em\s*\{[^}]*color:\s*var\(--cmi-brand-accent\)/s);
    expect(stylesheet).toMatch(/\.staff-login-security-label i\s*\{[^}]*background:\s*var\(--cmi-brand-soft\)/s);
  });

  it('uses navy links instead of treating ordinary login links as errors', () => {
    expect(stylesheet).toMatch(/\.staff-login-page a:not\(\.staff-login-submit\)\s*\{[^}]*color:\s*var\(--cmi-primary\)/s);
  });

  it('styles the recovery and connection-check buttons as normal navy actions', () => {
    expect(stylesheet).toMatch(/\.staff-login-page \.staff-login-inline-link\s*\{[^}]*color:\s*var\(--cmi-primary\)/s);
  });

  it('preserves dark-theme contrast using the dark-mode brand token', () => {
    expect(stylesheet).toMatch(/html\[data-theme="dark"\][\s\S]*?color:\s*var\(--cmi-brand-accent\)/);
  });
});
