/**
 * scripts/gen-icons.mjs
 *
 * Regenerates all app icon variants from the master asset public/icons/BOSicon.png.
 * Run once after the master changes:  node scripts/gen-icons.mjs
 *
 * Two palettes are emitted:
 *  - Dark master (transparent dark-green line-art) — favicon, PWA manifest,
 *    apple-touch, and any placement on a white/light surface (e.g. onboarding card).
 *      bos-icon-v2-{32,180,192,512}.png
 *  - White variant (every non-transparent pixel forced white, original alpha kept)
 *    — for green surfaces where the dark line-art would vanish (Header, AuthScreen,
 *    PinScreen, LoadingScreen).
 *      bos-icon-v2-white-{192,512}.png
 *
 * The white variant is required because the master strokes (~#2a4231) are nearly
 * identical to the brand background (#064e3b) and disappear on green.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = join(root, 'public/icons/BOSicon.png');
const OUT  = join(root, 'public/icons');

// Dark master — transparent background preserved.
const DARK_SIZES = [32, 180, 192, 512];
await Promise.all(DARK_SIZES.map(size =>
  sharp(SRC)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(OUT, `bos-icon-v2-${size}.png`))
));

// White variant — recolour every opaque pixel white, keep the original alpha channel.
const meta  = await sharp(SRC).metadata();
const alpha = await sharp(SRC).ensureAlpha().extractChannel('alpha').raw().toBuffer();
const whitePng = await sharp({
    create: { width: meta.width, height: meta.height, channels: 3, background: '#ffffff' },
  })
  .joinChannel(alpha, { raw: { width: meta.width, height: meta.height, channels: 1 } })
  .png()
  .toBuffer();

const WHITE_SIZES = [192, 512];
await Promise.all(WHITE_SIZES.map(size =>
  sharp(whitePng)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(OUT, `bos-icon-v2-white-${size}.png`))
));

console.log(`Generated: bos-icon-v2-{${DARK_SIZES.join(',')}}.png + bos-icon-v2-white-{${WHITE_SIZES.join(',')}}.png`);
