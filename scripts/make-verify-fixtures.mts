/**
 * Generate the files the admin UI verification needs.
 *
 * Lives inside the project so `sharp` resolves — a generated script in a temp
 * directory cannot import it under pnpm's strict node_modules layout.
 *
 * Usage: tsx scripts/make-verify-fixtures.mts <output-dir>
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const dir = process.argv[2];
if (!dir) {
  console.error("Usage: tsx scripts/make-verify-fixtures.mts <output-dir>");
  process.exit(1);
}

// A normal photograph-sized JPEG.
const w = 3000;
const h = 2000;
const buf = Buffer.allocUnsafe(w * h * 3);
for (let i = 0; i < buf.length; i += 3) {
  const t = i / buf.length;
  buf[i] = 40 + t * 180;
  buf[i + 1] = 90 + Math.sin(t * 40) * 60;
  buf[i + 2] = 160 - t * 100;
}
await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
  .jpeg({ quality: 90 })
  .toFile(`${dir}/test-photo.jpg`);

// A second, visibly different photo, for the preview-replacement check.
await sharp({
  create: { width: 800, height: 600, channels: 3, background: "#227744" },
})
  .jpeg({ quality: 85 })
  .toFile(`${dir}/second-photo.jpg`);

// Over the 50 MB limit. Noise is used because it resists JPEG compression;
// a smooth gradient this size would come out far too small.
const W = 10000;
const H = 7000;
const noise = Buffer.allocUnsafe(W * H * 3);
for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 256;
await sharp(noise, { raw: { width: W, height: H, channels: 3 } })
  .jpeg({ quality: 100 })
  .toFile(`${dir}/too-big.jpg`);

// An unsupported type.
writeFileSync(`${dir}/not-an-image.pdf`, "%PDF-1.4\n% not a real pdf\n");

// Twelve small, visibly distinct photos: enough for a batch at the limit of
// ten, one over it, and a couple left for the mixed-outcome batch.
for (let i = 1; i <= 12; i++) {
  const hue = Math.round((i / 12) * 360);
  await sharp({
    create: {
      width: 320,
      height: 240,
      channels: 3,
      background: { r: hue % 256, g: (hue * 3) % 256, b: (hue * 7) % 256 },
    },
  })
    .jpeg({ quality: 80 })
    .toFile(`${dir}/batch-${String(i).padStart(2, "0")}.jpg`);
}

// Named like a photo and typed like one by the browser, so it passes the
// screen's pre-flight checks — but the bytes do not decode, so it fails at
// finalization. This is what makes a mid-batch failure reachable through the
// real UI rather than only through a direct API call.
writeFileSync(`${dir}/broken.jpg`, "this is not a JPEG, it only claims to be");

// An AVIF, which dmbk's own finalize used to reject (sharp reports AVIF as
// `heif`); the dmbk GraphQL API finalizes it.
await sharp({
  create: { width: 640, height: 480, channels: 3, background: "#aa5522" },
})
  .avif({ quality: 60 })
  .toFile(`${dir}/photo.avif`);

console.log(`Fixtures written to ${dir}`);
