"""Slice the user-supplied hunt references; never used at runtime.

Usage: python3 scripts/extract-hunt-ui.py monster.png chapter.png battle.png
Coordinates refer to the supplied 1080 x 1920 reference canvases.
"""
import json
import sys
from collections import deque
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'public/assets/ui-kit/hunt'
OUT.mkdir(parents=True, exist_ok=True)
sources = [Image.open(path).convert('RGBA').resize((1080, 1920)) for path in sys.argv[1:4]]
manifest = {}


def save(name, source, box, key=False):
    image = sources[source].crop(box)
    # Only the brown backdrop connected to the crop edge is removed. Dark
    # interior mouth/wood pixels are retained, unlike a global color key.
    if key:
        pixels = image.load()
        width, height = image.size
        pending = deque([(x, y) for x in range(width) for y in (0, height - 1)] +
                        [(x, y) for y in range(height) for x in (0, width - 1)])
        seen = set()
        while pending:
            x, y = pending.popleft()
            if (x, y) in seen or not (0 <= x < width and 0 <= y < height):
                continue
            seen.add((x, y))
            r, g, b, a = pixels[x, y]
            if max(abs(r - 76), abs(g - 28), abs(b - 8)) > 28:
                continue
            pixels[x, y] = (r, g, b, 0)
            pending.extend(((x-1, y), (x+1, y), (x, y-1), (x, y+1)))
    image.save(OUT / f'{name}.webp', lossless=True)
    manifest[name] = {'source': Path(sys.argv[source + 1]).name, 'crop': box, 'size': image.size}
    return image


save('chef-avatar', 0, (60, 37, 222, 198), True)
save('select-title', 0, (279, 178, 805, 328), True)
save('chapter-title', 1, (188, 323, 887, 470), True)
save('corn-portrait', 0, (183, 391, 905, 1038))
save('chapter-island', 1, (138, 533, 944, 1246))
save('back', 0, (42, 231, 166, 357), True)
save('arrow', 0, (64, 635, 133, 750), True)
save('coin', 1, (53, 64, 141, 155), True)
save('plus', 1, (359, 76, 426, 146), True)
save('settings', 1, (913, 48, 1030, 179), True)
save('unlocked', 0, (401, 1126, 684, 1218), True)
save('dot-active', 1, (341, 1266, 403, 1328), True)
save('dot', 1, (427, 1266, 489, 1328), True)
save('cta-start', 0, (190, 1602, 896, 1814), True)
save('cta-hunt', 1, (227, 1361, 850, 1590), True)
for name, box in {'corn': (44, 1297, 285, 1576), 'carrot': (301, 1297, 538, 1576),
                  'cabbage': (554, 1297, 791, 1576), 'tomato': (806, 1297, 1042, 1576)}.items():
    save(f'card-{name}', 0, box, True)
for i, name in enumerate(['kitchen', 'inventory', 'stages', 'cookbook', 'shop']):
    save(f'nav-{name}', 1, (i * 216, 1674, (i + 1) * 216, 1920))
save('boss-mark', 2, (376, 223, 479, 323))
save('hp-fill', 2, (247, 343, 635, 369))
save('hp-track', 2, (655, 343, 837, 369))
# The border is stored independently from the dynamic red fill.
bar = save('hp-frame', 2, (207, 323, 875, 386))
for y in range(18, 46):
    for x in range(26, 642):
        bar.putpixel((x, y), (0, 0, 0, 0))
bar.save(OUT / 'hp-frame.webp', lossless=True)
save('meter-fill', 2, (68, 846, 101, 1528))
save('meter-track', 2, (74, 711, 101, 814))
# A narrow nine-slice of the shaft preserves real beveled wood edges while
# the inner well and fill are rendered separately.
shaft = save('meter-shaft', 2, (35, 650, 129, 1613))
for y in range(62, 928):
    for x in range(23, 78):
        shaft.putpixel((x, y), (0, 0, 0, 0))
shaft.save(OUT / 'meter-shaft.webp', lossless=True)
(OUT / 'source-slices.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
atlas_path = OUT / 'hud-parts.png'
if atlas_path.exists():
    atlas = Image.open(atlas_path)
    for name, (x, y, w, h) in {
        'timer': (16, 148, 771, 343), 'pause': (806, 111, 417, 426),
        'cut-medallion': (59, 635, 528, 512), 'item-socket': (672, 637, 535, 510),
    }.items():
        atlas.crop((x, y, x+w, y+h)).save(OUT / f'{name}.webp', lossless=True)
print(f'Extracted {len(manifest)} reference slices into {OUT}')
