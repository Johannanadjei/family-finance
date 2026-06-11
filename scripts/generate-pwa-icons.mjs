/**
 * scripts/generate-pwa-icons.mjs
 *
 * Generates the PWA icon set from the white-house transparent foregrounds.
 *
 * Why this exists: the manifest historically referenced green-house-on-white
 * assets (the inverse of the intended scheme). The brand mark is a WHITE house
 * on the brand-green plate (#064e3b). The white-house-on-transparent foregrounds
 * already exist; this script composites them onto solid green plates.
 *
 *   "any"      → full-bleed, house edge-to-edge (matches the source framing)
 *   "maskable" → house scaled to 80% inside an Android adaptive-icon safe zone,
 *                green plate fills the surrounding 20% margin so circular/squircle
 *                masks never clip the roofline.
 *
 * Idempotent: re-running overwrites the outputs cleanly.
 * Run: node scripts/generate-pwa-icons.mjs
 */

import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'public', 'icons');

const GREEN = '#064e3b'; // brand green (--c-header-from), per memory #18

const SRC_512 = join(ICONS_DIR, 'bos-icon-v2-white-512.png');
const SRC_192 = join(ICONS_DIR, 'bos-icon-v2-white-192.png');

const out = (name) => join(ICONS_DIR, name);

/** Solid green plate as a sharp input buffer. */
const greenPlate = (size) =>
  sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: GREEN,
    },
  });

/** Log a written file with its real on-disk dimensions/channels. */
async function report(path) {
  const m = await sharp(path).metadata();
  const rel = path.replace(join(__dirname, '..') + '/', '');
  console.log(`  ✅ ${rel} — ${m.width}x${m.height}, channels=${m.channels}, ${m.format}`);
}

/**
 * "any" purpose: white house full-bleed on a green plate.
 * Flatten backfills every transparent pixel with green — no positioning needed.
 */
async function generateAny(srcPath, size, outName) {
  let pipeline = sharp(srcPath);
  // Downscale the 512 source when producing the 180 apple-touch-icon.
  if (size !== 512 || srcPath !== SRC_512) {
    const meta = await sharp(srcPath).metadata();
    if (meta.width !== size) pipeline = pipeline.resize(size, size, { fit: 'cover' });
  }
  await pipeline
    .flatten({ background: GREEN })
    .png()
    .toFile(out(outName));
  await report(out(outName));
}

/**
 * "maskable" purpose: white house scaled to 80% of the canvas, centred on a
 * green plate that fills the full frame (the 20% margin is the safe zone).
 */
async function generateMaskable(srcPath, size, outName) {
  const inner = Math.round(size * 0.8);
  const foreground = await sharp(srcPath)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await greenPlate(size)
    .composite([{ input: foreground, gravity: 'centre' }])
    .png()
    .toFile(out(outName));
  await report(out(outName));
}

async function main() {
  console.log('Generating PWA icons (green plate + white house)…');

  console.log('• purpose:"any" (full-bleed)');
  await generateAny(SRC_192, 192, 'bos-icon-v2-green-192.png');
  await generateAny(SRC_512, 512, 'bos-icon-v2-green-512.png');
  await generateAny(SRC_512, 180, 'bos-icon-v2-green-180.png'); // apple-touch-icon

  console.log('• purpose:"maskable" (house at 80%, green safe-zone margin)');
  await generateMaskable(SRC_192, 192, 'bos-icon-v2-maskable-192.png');
  await generateMaskable(SRC_512, 512, 'bos-icon-v2-maskable-512.png');

  console.log('Done.');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
