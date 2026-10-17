#!/usr/bin/env python3
"""Convert the supplied monster animation PNGs to aligned, transparent WebP clips.

Requires Pillow. Source frame numbers retain identity and order even when the
export contains gaps. Per-frame rectangles remove transparent decode work while
the manifest retains one stable coordinate system for every animation clip.
Run from anywhere, for example:

    python3 scripts/prepare-monster-sprites.py --source-root ~/Downloads
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


MONSTERS = {
    'corn': '玉米',
    'carrot': '萝卜',
    'cabbage': '包菜',
    'jelly': '紫果冻',
    'tomato': 'zhanshi9',
}
CLIPS = ('Idle', 'Good', 'Perfect', 'Miss')
SOURCE_SIZE = (960, 960)
FRAME_ID = re.compile(r'(?<!\d)(\d{5})(?!\d)')


def source_frames(directory: Path) -> list[tuple[int, Path]]:
    if not directory.is_dir():
        raise FileNotFoundError(f'Missing animation directory: {directory}')
    frames: dict[int, Path] = {}
    for path in directory.iterdir():
        if path.suffix.lower() != '.png':
            continue
        matches = FRAME_ID.findall(path.stem)
        if not matches:
            raise ValueError(f'No five-digit frame number in {path}')
        number = int(matches[-1])
        if number in frames:
            raise ValueError(f'Duplicate frame number {number}: {frames[number]} and {path}')
        frames[number] = path
    if not frames:
        raise ValueError(f'No PNG frames in {directory}')
    return sorted(frames.items())


def white_background_mask(
    image: Image.Image, interior_seed: tuple[int, int] | None = None,
) -> Image.Image:
    """Find only near-white pixels connected to a canvas corner.

    The enclosed white eyes and teeth are deliberately not part of this mask.
    The original exports have an almost white, slightly noisy backdrop.
    """
    red, green, blue = image.convert('RGB').split()
    light_channels = [channel.point(lambda value: 255 if value >= 228 else 0)
                      for channel in (red, green, blue)]
    candidate = ImageChops.multiply(
        ImageChops.multiply(light_channels[0], light_channels[1]),
        light_channels[2],
    )
    # floodfill changes only connected candidate pixels (0); nonwhite pixels
    # are barriers (255). Starting at all four corners handles disconnected
    # outside regions without flooding enclosed facial details.
    marked = candidate.point(lambda value: 0 if value else 255)
    width, height = image.size
    for seed in ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1),
                 *([interior_seed] if interior_seed else [])):
        if marked.getpixel(seed) == 0:
            ImageDraw.floodfill(marked, seed, 128, thresh=0)
    return marked.point(lambda value: 255 if value == 128 else 0)


def cleaned_frame(
    path: Path, remove_white: bool, interior_seed: tuple[int, int] | None = None,
) -> Image.Image:
    with Image.open(path) as source:
        image = source.convert('RGBA')
    if image.size != SOURCE_SIZE:
        raise ValueError(f'Unexpected frame dimensions {image.size}: {path}')
    alpha = image.getchannel('A')
    # Also catch a future frame with an unreported opaque white backdrop.
    # Effect highlights may reach an edge, so require a white corner seed.
    corners = ((0, 0), (959, 0), (0, 959), (959, 959))
    if not remove_white:
        remove_white = any(
            alpha.getpixel(point) >= 128
            and min(image.getpixel(point)[:3]) >= 228
            for point in corners
        )
    if remove_white:
        alpha = ImageChops.subtract(alpha, white_background_mask(image, interior_seed))
        image.putalpha(alpha)
        if any(alpha.getpixel(point) != 0 for point in corners):
            raise ValueError(f'White background remained at canvas corner: {path}')
    elif alpha.getextrema()[0] == 255:
        raise ValueError(f'Unexpected opaque image; review background removal: {path}')
    # A transparent pixel should not carry the source's white RGB matte.
    opaque_or_partial = alpha.point(lambda value: 255 if value else 0)
    return Image.composite(image, Image.new('RGBA', image.size), opaque_or_partial)


def visible_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    thresholded = image.getchannel('A').point(lambda value: 255 if value >= 128 else 0)
    return thresholded.getbbox()


def padded_alpha_rect(image: Image.Image, padding: int = 2) -> tuple[int, int, int, int]:
    """Keep every nonzero alpha pixel plus a small transparent sampling border.

    The rectangle is relative to the existing global crop. Its offset must be
    applied when drawing the tight image; it is not a new animation origin.
    """
    box = image.getchannel('A').getbbox()
    if box is None:
        raise ValueError('Cannot crop an empty animation frame')
    return (max(0, box[0] - padding), max(0, box[1] - padding),
            min(image.width, box[2] + padding), min(image.height, box[3] + padding))


def remove_white_for(monster: str, clip: str, number: int) -> bool:
    return (monster == 'cabbage' and clip == 'Good') or (
        monster == 'carrot' and clip == 'Good' and number == 26
    )


def interior_white_seed_for(monster: str, clip: str, number: int) -> tuple[int, int] | None:
    # The one carrot Good export has a white pocket enclosed between its fork
    # and body, so it cannot be reached from the canvas edge. Keep the smaller
    # enclosed white component in the face.
    return (445, 425) if (monster, clip, number) == ('carrot', 'Good', 26) else None


def indexed_clips(monster: str, directory: Path) -> dict[str, list[tuple[int, Path]]]:
    if monster != 'tomato':
        return {clip: source_frames(directory / clip) for clip in CLIPS}
    # zhanshi9 is one take, not four labelled clips. Keep its neutral bookends
    # out of the hit cycle, reserve the large flash for Perfect, and never play
    # a successful-hit animation when the player misses. No new poses are made.
    frames = source_frames(directory)
    return {
        'Idle': [(n, path) for n, path in frames if n <= 26 or n >= 77],
        'Good': [(n, path) for n, path in frames if 26 <= n <= 77 and n != 29],
        'Perfect': [(n, path) for n, path in frames if 26 <= n <= 77],
        'Miss': [(n, path) for n, path in frames if n <= 26 or n >= 77],
    }


def convert_monster(monster: str, source_root: Path, output_root: Path, quality: int,
                    image_scale: float = 1) -> dict:
    source_directory = source_root / MONSTERS[monster]
    indexed = indexed_clips(monster, source_directory)
    if any(not frames for frames in indexed.values()):
        raise ValueError(f'Missing required animation segment: {source_directory}')

    # One union in source coordinates gives every clip the same stable origin.
    # Tight WebP frames later retain their offset within this shared crop.
    x0, y0, x1, y1 = 960, 960, 0, 0
    for clip, frames in indexed.items():
        for number, path in frames:
            image = cleaned_frame(path, remove_white_for(monster, clip, number),
                                  interior_white_seed_for(monster, clip, number))
            box = visible_bbox(image)
            if box is None:
                raise ValueError(f'Empty animation frame: {path}')
            x0, y0 = min(x0, box[0]), min(y0, box[1])
            x1, y1 = max(x1, box[2]), max(y1, box[3])
    padding = 8
    crop = (max(0, x0 - padding), max(0, y0 - padding),
            min(960, x1 + padding), min(960, y1 + padding))
    crop_width, crop_height = crop[2] - crop[0], crop[3] - crop[1]

    destination = output_root / monster
    manifest: dict = {
        'sourceSize': list(SOURCE_SIZE),
        'crop': [crop[0], crop[1], crop_width, crop_height],
        'clips': {},
    }
    if image_scale != 1:
        manifest['imageScale'] = image_scale
    written: set[str] = set()
    for clip, frames in indexed.items():
        clip_directory = 'Shared' if monster == 'tomato' else clip
        clip_destination = destination / clip_directory
        clip_destination.mkdir(parents=True, exist_ok=True)
        entries: list[dict] = []
        for number, source_path in frames:
            image = cleaned_frame(source_path, remove_white_for(monster, clip, number),
                                  interior_white_seed_for(monster, clip, number))
            relative_file = f'{clip_directory}/{number:05d}.webp'
            output_path = destination / relative_file
            aligned = image.crop(crop)
            rect = padded_alpha_rect(aligned)
            frame_width, frame_height = rect[2] - rect[0], rect[3] - rect[1]
            tight = aligned.crop(rect)
            # Preserve the source-space rectangle and body anchors. Only the
            # decode resolution changes; the renderer still draws at the same size.
            export_size = (max(1, int(frame_width * image_scale + .5)),
                           max(1, int(frame_height * image_scale + .5)))
            exported = tight if image_scale == 1 else tight.resize(export_size, Image.Resampling.LANCZOS)
            if relative_file not in written:
                exported.save(output_path, format='WEBP', quality=quality, method=5, exact=True)
                written.add(relative_file)
            with Image.open(output_path) as decoded:
                if decoded.format != 'WEBP' or decoded.size != export_size:
                    raise ValueError(f'Invalid converted frame: {output_path}')
                rgba = decoded.convert('RGBA')
                if ImageChops.difference(exported.getchannel('A'), rgba.getchannel('A')).getbbox():
                    raise ValueError(f'Converted frame changed alpha: {output_path}')
                tight_bbox = visible_bbox(tight)
            if tight_bbox is None:
                raise ValueError(f'Converted frame became invisible: {output_path}')
            bbox = [tight_bbox[0] + rect[0], tight_bbox[1] + rect[1],
                    tight_bbox[2] + rect[0], tight_bbox[3] + rect[1]]
            entries.append({'n': number, 'file': relative_file, 'bbox': bbox,
                            'rect': [rect[0], rect[1], frame_width, frame_height]})
        manifest['clips'][clip] = entries
    destination.mkdir(parents=True, exist_ok=True)
    (destination / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + '\n',
        encoding='utf-8',
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=Path.home() / 'Downloads')
    parser.add_argument('--output-root', type=Path, default=Path(__file__).resolve().parents[1]
                        / 'public/assets/monster-sprites')
    parser.add_argument('--boss', choices=MONSTERS, action='append', dest='bosses')
    parser.add_argument('--quality', type=int, default=76)
    parser.add_argument('--image-scale', type=float, default=None,
                        help='Decode resolution; default corn=.5, other monsters=1. Geometry is unchanged.')
    args = parser.parse_args()
    if not 1 <= args.quality <= 100:
        parser.error('--quality must be between 1 and 100')
    if args.image_scale is not None and not 0 < args.image_scale <= 1:
        parser.error('--image-scale must be greater than 0 and at most 1')
    for boss in args.bosses or MONSTERS:
        image_scale = args.image_scale if args.image_scale is not None else (.5 if boss == 'corn' else 1)
        manifest = convert_monster(boss, args.source_root, args.output_root, args.quality, image_scale)
        counts = ', '.join(f'{clip}={len(manifest["clips"][clip])}' for clip in CLIPS)
        print(f'{boss}: {counts}; crop={manifest["crop"]}')


if __name__ == '__main__':
    main()
