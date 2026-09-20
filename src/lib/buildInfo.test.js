/**
 * lib/buildInfo.test.js
 *
 * Asserts the SHAPE of the build stamp, never a literal value.
 *
 * A literal assertion is exactly what made the old hand-bumped BUILD_MARKER
 * unreliable: the test and the constant were edited together, so the test only ever
 * confirmed that someone had typed the same string twice. The value here is now
 * different on every commit by design, so what is worth holding is the contract the
 * PWA re-test depends on — a 7-hex SHA (or the 'local' fallback), optionally joined
 * to a human date, and non-empty.
 *
 * The defines come from vite.config.js `test.define`, so this also proves that
 * wiring: without it the SHA would silently read 'local' in CI and on Vercel.
 */

import { describe, it, expect } from 'vitest';
import { BUILD_MARKER, BUILD_SHA, BUILD_DATE } from './buildInfo';

const SHA_OR_LOCAL = /^([0-9a-f]{7}|local)$/;
const DATE_SHAPE   = /^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/;

describe('buildInfo', () => {
  it('BUILD_SHA is a 7-hex short SHA, or the local fallback', () => {
    expect(BUILD_SHA).toMatch(SHA_OR_LOCAL);
  });

  it('BUILD_DATE reads as a human date', () => {
    expect(BUILD_DATE).toMatch(DATE_SHAPE);
  });

  it('BUILD_MARKER joins the two with a middot', () => {
    expect(BUILD_MARKER).toBe(`${BUILD_SHA} · ${BUILD_DATE}`);
  });

  it('BUILD_MARKER is never empty — the PWA re-test reads it as the proof of takeover', () => {
    expect(BUILD_MARKER.trim().length).toBeGreaterThan(0);
  });

  it('carries no leftover hand-typed marker', () => {
    // The old value was 'v2 — 2026-09-19'. If a literal like that ever comes back,
    // the stamp has stopped tracking the commit and the re-test is lying again.
    expect(BUILD_MARKER).not.toMatch(/^v\d/);
  });

  it('the defines actually reached the bundle — the SHA is not silently local in CI', () => {
    // Locally and in CI there IS a git checkout, so 'local' here means the
    // vite.config define was dropped rather than that git was unavailable.
    expect(BUILD_SHA).toMatch(/^[0-9a-f]{7}$/);
  });
});
