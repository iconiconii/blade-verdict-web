import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Mechanical sprite packing only; the generated illustration is not repainted.
// npm install --no-save sharp, or set SHARP_MODULE to an existing sharp package.
const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require(process.env.SHARP_MODULE || 'sharp');
} catch {
  throw new Error('Packing requires sharp. Install sharp or set SHARP_MODULE to its absolute package directory.');
}

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'public/assets/ui-kit');
const source = path.join(directory, 'items-atlas.png');
const iconDirectory = path.join(directory, 'icons');
const names = [
  'corn', 'carrot', 'cabbage', 'tomato',
  'potato', 'mushroom', 'chili', 'pumpkin',
  'broccoli', 'eggplant', 'coin', 'gem',
  'pot', 'chest', 'map', 'book',
];
const cellSize = 192;
const contentSize = 144;
const alphaThreshold = 32;
const { width, height } = await sharp(source).metadata();
if (!width || !height) throw new Error('Source image has no dimensions.');
await mkdir(iconDirectory, { recursive: true });
const composites = [];
const icons = [];

for (const [index, name] of names.entries()) {
  const column = index % 4;
  const row = Math.floor(index / 4);
  const left = Math.round(column * width / 4);
  const top = Math.round(row * height / 4);
  const cellWidth = Math.round((column + 1) * width / 4) - left;
  const cellHeight = Math.round((row + 1) * height / 4) - top;
  const cell = await sharp(source)
    .extract({ left, top, width: cellWidth, height: cellHeight })
    .ensureAlpha().raw().toBuffer();
  let minX = cellWidth;
  let minY = cellHeight;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      if (cell[(y * cellWidth + x) * 4 + 3] <= alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) throw new Error(`Empty sprite cell: ${name}`);
  // Keep two pixels of original antialiasing around the visible silhouette.
  minX = Math.max(0, minX - 2);
  minY = Math.max(0, minY - 2);
  maxX = Math.min(cellWidth - 1, maxX + 2);
  maxY = Math.min(cellHeight - 1, maxY + 2);
  const bounds = { left: left + minX, top: top + minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const resized = await sharp(source).extract(bounds)
    .resize(contentSize, contentSize, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const sprite = await sharp({ create: { width: cellSize, height: cellSize, channels: 4, background: '#00000000' } })
    .composite([{ input: resized.data, left: Math.floor((cellSize - resized.info.width) / 2), top: Math.floor((cellSize - resized.info.height) / 2) }])
    .png().toBuffer();
  await writeFile(path.join(iconDirectory, `${name}.png`), sprite);
  composites.push({ input: sprite, left: column * cellSize, top: row * cellSize });
  icons.push({ name, index, row, column, file: `icons/${name}.png`, sourceBounds: bounds, atlasBounds: { x: column * cellSize, y: row * cellSize, width: cellSize, height: cellSize } });
}

await sharp({ create: { width: cellSize * 4, height: cellSize * 4, channels: 4, background: '#00000000' } })
  .composite(composites).png().toFile(path.join(directory, 'items-atlas-packed.png'));
await writeFile(path.join(directory, 'items-atlas-metadata.json'), `${JSON.stringify({
  source: 'items-atlas.png', atlas: 'items-atlas-packed.png', width: cellSize * 4, height: cellSize * 4,
  columns: 4, rows: 4, cellSize, contentSize, alphaThreshold, icons,
}, null, 2)}\n`);
console.log(`Packed ${icons.length} icons at ${cellSize}px and a ${cellSize * 4}px atlas.`);
