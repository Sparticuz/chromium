from itertools import combinations
import json
from pathlib import Path

from PIL import Image, ImageChops

out = Path('ab-results')
captures = json.loads((out / 'captures.json').read_text())
assert len(captures) == 16
results = []
for a, b in combinations(captures, 2):
    if (a['type'], a['name']) != (b['type'], b['name']):
        continue
    left, right = [Image.open(out / row['file']).convert('RGBA') for row in (a, b)]
    assert left.size == right.size == (1920, 1080)
    delta = ImageChops.difference(left, right)
    red, green, blue, alpha = [channel.tobytes() for channel in delta.split()]
    different = sum(bool(r | g | b | a) for r, g, b, a in zip(red, green, blue, alpha, strict=True))
    result = dict(type=a['type'], page=a['name'], a=a['variant'], b=b['variant'], pixels=different,
                  total=left.width * left.height, bbox=delta.getbbox(alpha_only=False), same_png_hash=a['hash'] == b['hash'],
                  same_requested_urls=a['requested'] == b['requested'] if a['type'] == 'fixed' else None)
    results.append(result)
    if a['variant'] == 'on1' and b['variant'] == 'off1' and different:
        delta.convert('RGB').point([min(255, n * 4) for n in range(256)] * 3).save(out / f"{a['type']}-{a['name']}-diff.png")
    print(json.dumps(result))
assert len(results) == 24
(out / 'pixels.json').write_text(json.dumps(results, indent=2))
