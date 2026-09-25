import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  const bundledSharp = join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
  sharp = require(process.env.UI_KIT_SHARP_MODULE || bundledSharp);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'public/assets/ui-kit/controls-atlas.png');
const destination = join(root, 'public/assets/ui-kit/controls');
const padding = 4;

// Measured alpha>=128 bounds: generated rows are not uniformly spaced.
// Slice values use CSS order: top, right, bottom, left, in source pixels.
const controls = [
  { name: 'gold', bounds: [34, 97, 488, 230], slice: [40, 45, 40, 45] },
  { name: 'blue', bounds: [541, 97, 995, 230], slice: [40, 45, 40, 45] },
  { name: 'green', bounds: [1049, 97, 1503, 230], slice: [40, 45, 40, 45] },
  { name: 'wood', bounds: [34, 319, 488, 455], slice: [40, 45, 40, 45] },
  { name: 'danger', bounds: [541, 319, 995, 455], slice: [40, 45, 40, 45] },
  { name: 'disabled', bounds: [1049, 319, 1503, 455], slice: [40, 45, 40, 45] },
  // Wider side slices preserve the decorative leaf clusters and ribbon tails.
  { name: 'title', bounds: [20, 538, 502, 696], slice: [48, 100, 48, 100] },
  { name: 'victory', bounds: [537, 545, 999, 689], slice: [40, 70, 40, 70] },
  { name: 'defeat', bounds: [1046, 546, 1506, 688], slice: [40, 55, 40, 55] },
  { name: 'parchment', bounds: [35, 768, 487, 919], slice: [45, 45, 45, 45] },
  { name: 'slot', bounds: [545, 761, 991, 927], slice: [48, 48, 48, 48] },
  { name: 'nav', bounds: [1051, 773, 1502, 915], slice: [40, 45, 40, 45] },
];

await mkdir(destination, { recursive: true });
for (const { name, bounds: [left, top, right, bottom], slice } of controls) {
  const info = await sharp(source)
    .extract({
      left: left - padding,
      top: top - padding,
      width: right - left + padding * 2,
      height: bottom - top + padding * 2,
    })
    .png()
    .toFile(join(destination, `${name}.png`));
  console.log(`${name}: ${info.width}x${info.height}; nine-slice: ${slice.join(' ')}`);
}
