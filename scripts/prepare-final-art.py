"""Prepare the supplied 1016 ZIP for the web UI without changing its artwork.

Usage: python3 scripts/prepare-final-art.py /path/to/1016资产.zip
Originals stay in the supplied ZIP; only runtime WebP derivatives are emitted.
"""
import io
import sys
from collections import deque
from pathlib import Path
from zipfile import ZipFile

from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'public/assets/art-1016'
archive = ZipFile(sys.argv[1])


def source(name):
    return Image.open(io.BytesIO(archive.read('1016资产/' + name))).convert('RGBA')


def save(image, name, size=None):
    image = image.copy()
    if size:
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
    path = OUT / (name + '.webp')
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, 'WEBP', quality=92, method=6)


def cut_background(image, predicate):
    """Remove only matching backdrop pixels connected to the crop boundary."""
    image = image.copy()
    w, h = image.size
    pixels = image.load()
    queue = deque([(x, y) for x in range(w) for y in (0, h - 1)] +
                  [(x, y) for y in range(h) for x in (0, w - 1)])
    visited = set()
    while queue:
        x, y = queue.popleft()
        if not (0 <= x < w and 0 <= y < h) or (x, y) in visited:
            continue
        visited.add((x, y))
        r, g, b, a = pixels[x, y]
        if predicate(r, g, b):
            pixels[x, y] = (r, g, b, 0)
            queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    return image


for index, (name, slug) in enumerate([
    ('烤玉米片', 'corn-toast'), ('果冻布丁', 'jelly-pudding'),
    ('玉米果冻盅', 'corn-jelly'), ('烤胡萝卜根', 'carrot-roast'),
    ('白菜卷', 'cabbage-roll'), ('西红柿汁', 'tomato-juice'),
    ('蔬菜汤', 'vegetable-soup'), ('果冻沙拉', 'jelly-salad'),
    ('素食烩菜', 'vegetable-stew'), ('玉米饼', 'corn-pancake'),
], 1):
    save(source(f'菜谱icon/{index:02}_{name}.png'), f'dishes/{slug}', 320)

for name, slug in [('玉米怪', 'corn'), ('胡萝卜怪', 'carrot'), ('白菜怪', 'cabbage'),
                   ('番茄怪', 'tomato'), ('果冻怪', 'jelly')]:
    image = source(f'角色选择立绘/{name}.png')
    save(image, f'monsters/{slug}', 960)
    save(image, f'monsters/{slug}-thumb', 256)

chapter = source('第二章效果.png')
brown = lambda r, g, b: r < 150 and g < 76 and b < 44 and r > g * 1.5
crops = {
    'jelly-title': (118, 240, 843, 383),
    'jelly-island': (78, 410, 892, 1137),
    'coin': (45, 54, 124, 132), 'plus': (311, 65, 373, 128),
    'settings': (797, 44, 904, 151), 'arrow': (42, 698, 105, 797),
    'dot-active': (297, 1136, 350, 1190), 'dot': (370, 1136, 424, 1190),
    'cta-hunt': (193, 1201, 747, 1396),
}
for name, box in crops.items():
    image = chapter.crop(box)
    if name == 'jelly-island':
        # Arrows are separate controls. These rectangles exclude only their
        # outside-the-island pixels, not any part of the island silhouette.
        image.paste((80, 28, 7, 255), (0, 280, 28, 394))
        image.paste((80, 28, 7, 255), (760, 280, image.width, 394))
    save(cut_background(image, brown), f'hunt/{name}')

# The reference has a baked green Explore tile. Strip the tile backgrounds;
# React/CSS supplies the current selection instead on every world screen.
for i, name in enumerate(['kitchen', 'inventory', 'stages', 'cookbook', 'shop']):
    image = chapter.crop((round(i * 941 / 5) + 3, 1475, round((i + 1) * 941 / 5) - 3, 1643))
    tile = lambda r, g, b: (r > 210 and g > 140 and b < 190) or (r > 130 and g > 190 and b < 150)
    save(cut_background(image, tile), f'hunt/nav-{name}')

print(f'Prepared {len(list(OUT.rglob("*.webp")))} runtime assets in {OUT}')
