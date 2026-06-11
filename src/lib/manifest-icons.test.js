/**
 * lib/manifest-icons.test.js
 *
 * Guards the PWA icon set: every icon referenced by public/manifest.json (and the
 * apple-touch-icon in index.html) must actually exist on disk. This is the test
 * that would have caught the inverted-icon bug from shipping a dangling reference.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const PUBLIC = join(ROOT, 'public');

const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.json'), 'utf8'));

describe('PWA manifest icons', () => {
  it('declares at least one "any" and one "maskable" icon', () => {
    const purposes = manifest.icons.map(i => i.purpose);
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  it('every manifest icon file exists on disk', () => {
    for (const icon of manifest.icons) {
      // manifest paths are absolute from the web root (/icons/..) → map to public/
      const onDisk = join(PUBLIC, icon.src.replace(/^\//, ''));
      expect(existsSync(onDisk), `missing icon: ${icon.src}`).toBe(true);
    }
  });

  it('every manifest icon declares src, sizes, type and purpose', () => {
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(/\.png$/);
      expect(icon.sizes).toMatch(/^\d+x\d+$/);
      expect(icon.type).toBe('image/png');
      expect(['any', 'maskable']).toContain(icon.purpose);
    }
  });

  it('apple-touch-icon referenced in index.html exists on disk', () => {
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const match = html.match(/rel="apple-touch-icon"\s+href="([^"]+)"/);
    expect(match, 'no apple-touch-icon link found').toBeTruthy();
    const onDisk = join(PUBLIC, match[1].replace(/^\//, ''));
    expect(existsSync(onDisk), `missing apple-touch-icon: ${match[1]}`).toBe(true);
  });
});
