import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('../visual-system.css', import.meta.url), 'utf8');

describe('visual system regression contracts', () => {
  it('uses a valid focus-ring colour token rather than a box-shadow token as an outline colour', () => {
    expect(stylesheet).toContain('--cmi-focus-color:');
    expect(stylesheet).toMatch(/outline:\s*3px solid var\(--cmi-focus-color\)/);
  });

  it('styles all existing form families without resizing native choice and file controls', () => {
    for (const family of [
      '.cmi-form-grid', '.cmi-detail-form', '.cmi-structure-form',
      '.ministry-report-form', '.staff-login-auth-form',
    ]) expect(stylesheet).toContain(family);
    expect(stylesheet).toMatch(/input:not\(\[type=["']checkbox["']\]\):not\(\[type=["']radio["']\]\):not\(\[type=["']file["']\]\)/);
  });

  it('keeps touch targets and text usable on compact screens', () => {
    expect(stylesheet).toMatch(/min-height:\s*(44|4[6-9]|5\d)px/);
    expect(stylesheet).toMatch(/font-size:\s*(14|15|16)px/);
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*480px\)/);
  });

  it('keeps motion optional and respects reduced-motion preferences', () => {
    expect(stylesheet).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
function contrast(foreground, background) {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('semantic text contrast', () => {
  it('keeps secondary and subtle light-theme text at WCAG AA contrast', () => {
    const subtle = stylesheet.match(/--cmi-subtle:\s*(#[0-9a-f]{6})/i)?.[1];
    const muted = stylesheet.match(/--cmi-muted:\s*(#[0-9a-f]{6})/i)?.[1];
    const accent = stylesheet.match(/--cmi-brand-accent:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(subtle).toBeTruthy();
    expect(muted).toBeTruthy();
    expect(accent).toBeTruthy();
    expect(contrast(subtle, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps dark-theme secondary text and gold accent readable', () => {
    const dark = stylesheet.match(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const subtle = dark.match(/--cmi-subtle:\s*(#[0-9a-f]{6})/i)?.[1];
    const muted = dark.match(/--cmi-muted:\s*(#[0-9a-f]{6})/i)?.[1];
    const accent = dark.match(/--cmi-brand-accent:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(contrast(subtle, '#18232e')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, '#18232e')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(accent, '#18232e')).toBeGreaterThanOrEqual(4.5);
  });
});
