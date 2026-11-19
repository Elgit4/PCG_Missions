import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CrestOutlineLoader } from './CrestOutlineLoader.tsx';
import { pcgCrestOutlinePath } from '../assets/pcg-crest-outline.ts';
const visualSystem = readFileSync(new URL('../visual-system.css', import.meta.url), 'utf8');
describe('CrestOutlineLoader', () => {
 it('renders one unfilled compound path immediately', () => {
  const markup = renderToStaticMarkup(createElement(CrestOutlineLoader));
  expect(markup).toContain('viewBox="0 0 600 680"');
  expect(markup.split('<path').length - 1).toBe(1);
  expect(markup).toContain('fill="none"');
  expect(markup).toContain(pcgCrestOutlinePath.slice(0, 48));
  expect(markup).not.toContain('<img');
  expect(markup).not.toContain('spinner');
 });
 it('uses one stroke colour and supports reduced motion', () => {
  expect(visualSystem).toContain('.cmi-crest-outline-path');
  expect(visualSystem).toContain('--cmi-loader-accent: #c7b06d');
  expect(visualSystem).toContain('stroke: var(--cmi-loader-accent)');
  expect(visualSystem).toContain('stroke-width: 2.6');
  expect(visualSystem).toContain('background: #090d18');
  expect(visualSystem).toContain('color: #eef3f7');
  expect(visualSystem).toContain('stroke-dashoffset: .995');
  expect(visualSystem).toContain('stroke-dashoffset: 0');
  expect(visualSystem).toContain('from { stroke-dashoffset: .995; }');
  expect(visualSystem).toContain('prefers-reduced-motion: reduce');
 });
});
