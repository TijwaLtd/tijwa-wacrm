// ============================================================
// Generate PWA app icons from the source logo.
//
// The source logo (public/logo.png) is a 515x143 transparent
// wordmark. The service-worker / install-banner / notification icons
// need to be square PNGs on an opaque background — a transparent
// wordmark renders invisibly or squashed on Android/iOS/Chrome.
//
// This script centres the wordmark inside a square, on the brand
// background colour, with safe padding for the "maskable" purpose
// (Android crops to a circle — keep content inside the inner 80%).
//
// Run: node scripts/generate-pwa-icons.mjs
// Requires: sharp (devDependency). Regenerate only when the logo
// changes — output is committed to public/icons/.
// ============================================================

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const LOGO = path.join(PUBLIC_DIR, 'logo.png');
const OUT_DIR = path.join(PUBLIC_DIR, 'icons');

// Brand background — matches the app's dark shell (themeColor).
const BG = { r: 2, g: 6, b: 23, alpha: 1 }; // #020617
// Fraction of the square the logo's longer side occupies. 0.72 keeps
// content inside the maskable safe zone (inner 80% circle) with margin.
const LOGO_FRACTION = 0.72;

const SIZES = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-512-maskable.png', size: 512, purpose: 'maskable' },
  { name: 'apple-touch-icon.png', size: 180 },
];

async function generate() {
  await mkdir(OUT_DIR, { recursive: true });

  const logoMeta = await sharp(LOGO).metadata();
  const { width = 515, height = 143 } = logoMeta;

  for (const { name, size } of SIZES) {
    // Target box for the wordmark's longer edge.
    const logoW = Math.round(size * LOGO_FRACTION);
    const logoH = Math.max(1, Math.round((height / width) * logoW));
    const left = Math.round((size - logoW) / 2);
    const top = Math.round((size - logoH) / 2);

    const resized = await sharp(LOGO).resize(logoW, logoH).png().toBuffer();

    await sharp({
      create: { width: size, height: size, channels: 4, background: BG },
    })
      .composite([{ input: resized, left, top }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, name));

    console.log(`✓ ${name} (${size}x${size})`);
  }

  // Favicon PNGs (opaque bg so they read on light tabs).
  for (const [name, size] of [
    ['favicon-32.png', 32],
    ['favicon-16.png', 16],
  ]) {
    const logoW = Math.round(size * 0.82);
    const logoH = Math.max(1, Math.round((height / width) * logoW));
    const resized = await sharp(LOGO)
      .resize(logoW, logoH)
      .png()
      .toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: BG },
    })
      .composite([
        { input: resized, left: Math.round((size - logoW) / 2), top: Math.round((size - logoH) / 2) },
      ])
      .png()
      .toFile(path.join(PUBLIC_DIR, name));
    console.log(`✓ ${name} (${size}x${size})`);
  }

  // Multi-size favicon.ico (32 + 16) via sharp — write both sizes,
  // Chrome/Safari pick what they need. Best-effort: some browsers
  // only read .ico; PNG favicons cover the rest.
  const ico32 = await sharp({
    create: { width: 32, height: 32, channels: 4, background: BG },
  })
    .composite([
      {
        input: await sharp(LOGO).resize(Math.round(32 * 0.82), Math.max(1, Math.round((height / width) * Math.round(32 * 0.82)))).png().toBuffer(),
        left: Math.round((32 - Math.round(32 * 0.82)) / 2),
        top: Math.round((32 - Math.max(1, Math.round((height / width) * Math.round(32 * 0.82)))) / 2),
      },
    ])
    .png()
    .toBuffer();
  await writeFile(path.join(PUBLIC_DIR, 'favicon.png'), ico32);
  console.log('✓ favicon.png (32x32)');

  console.log('\nDone. Restart dev server / redeploy to pick up new icons.');
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
