"""Build density-normalized QA boards from reference and browser captures."""
from pathlib import Path
import sys
from PIL import Image

out = Path(__file__).resolve().parents[1] / 'artifacts/hunt-ui'
for reference, implementation, name in zip(sys.argv[1:4], ['monster-390.png', 'chapter-390.png', 'battle-390-v3.png'], ['monsters', 'chapter', 'battle']):
    source = Image.open(reference).convert('RGB').resize((390, 693), Image.Resampling.LANCZOS)
    result = Image.open(out / implementation).convert('RGB').resize((390, 693), Image.Resampling.LANCZOS)
    board = Image.new('RGB', (800, 693), '#fff5df')
    board.paste(source, (0, 0))
    board.paste(result, (410, 0))
    board.save(out / f'comparison-{name}.png')
    if name == 'battle':
        detail = Image.new('RGB', (800, 440), '#fff5df')
        detail.paste(source.crop((0, 0, 390, 210)), (0, 0))
        detail.paste(result.crop((0, 0, 390, 210)), (410, 0))
        detail.paste(source.crop((0, 530, 390, 693)), (0, 240))
        detail.paste(result.crop((0, 530, 390, 693)), (410, 240))
        detail.save(out / 'comparison-battle-hud.png')
