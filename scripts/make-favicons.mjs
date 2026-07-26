import sharp from 'sharp';
import fs from 'fs';

const src = 'public/logo-icon.png';
const bg = { r: 13, g: 13, b: 26, alpha: 1 };

for (const size of [16, 32, 48]) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: bg })
    .png()
    .toFile(`public/favicon-${size}.png`);
}

await sharp(src)
  .resize(32, 32, { fit: 'contain', background: bg })
  .png()
  .toFile('public/favicon.png');

// Self-contained SVG (no external image — that caused the blank dark tab icon)
const png48 = fs.readFileSync('public/favicon-48.png');
const b64 = png48.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10" fill="#0d0d1a"/>
  <image href="data:image/png;base64,${b64}" x="2" y="2" width="44" height="44" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
fs.writeFileSync('public/favicon.svg', svg);

// Modern Chrome accepts PNG bytes served as favicon.ico
fs.copyFileSync('public/favicon-32.png', 'public/favicon.ico');

for (const f of [
  'favicon-16.png',
  'favicon-32.png',
  'favicon-48.png',
  'favicon.png',
  'favicon.svg',
  'favicon.ico',
]) {
  console.log(f, fs.statSync(`public/${f}`).size);
}
