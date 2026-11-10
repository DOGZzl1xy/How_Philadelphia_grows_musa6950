"""Opening shot: Center City to Point Breeze from above, zooming into scene s3 (-> web/public/data/hero/, git-ignored).

    uv run python web/pipeline/export_hero.py

Four layers from the 2025 flight, graded like every other photo on the site:
- wide.webp   9 km square framed on Center City, the Schuylkill and 30th Street Station, with scene s3 to the south
- mid.webp    4 km square around the scene
- near.webp   1 km square around the scene
- (the block itself is scenes/s3/photo_2025.webp, 256 m)
layers.json gives each layer's centre offset (east, north) and side in metres RELATIVE TO THE SCENE CENTRE, so no
geographic coordinate is written. Run export_scenes.py first (it defines the scene).
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(Path(__file__).parent))
import ortho_chips as O  # noqa: E402
from export_scenes import FT, frame, grade, pick_cells  # noqa: E402

OUT = ROOT / "web/public/data/hero"
YEAR = 2025
LAYERS = [("wide", 9000.0, 16, 3072), ("mid", 4000.0, 16, 2048), ("near", 1000.0, 18, 2048)]
CITY_HALL = (-75.1636, 39.9524)   # landmark used only to frame the opening view (not written to any file)
to_merc = Transformer.from_crs(2272, 3857, always_xy=True)
to_2272 = Transformer.from_crs(3857, 2272, always_xy=True)


def mosaic(cx, cy, side_m, z, px):
    """Square image of side_m ground metres centred on (cx, cy) in EPSG:2272, from zoom-z tiles, px wide."""
    mx, my = to_merc.transform(cx, cy)
    lat = Transformer.from_crs(2272, 4326, always_xy=True).transform(cx, cy)[1]
    half = side_m / 2 / np.cos(np.radians(lat))
    r = O._res(z)
    bx0, by0, bx1, by1 = mx - half, my - half, mx + half, my + half
    tx0, tx1 = int((bx0 + O.ORIGIN) / (256 * r)), int((bx1 + O.ORIGIN) / (256 * r))
    ty0, ty1 = int((O.ORIGIN - by1) / (256 * r)), int((O.ORIGIN - by0) / (256 * r))
    im = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            im.paste(O.tile(YEAR, z, tx, ty), ((tx - tx0) * 256, (ty - ty0) * 256))
    ox, oy = tx0 * 256 * r - O.ORIGIN, O.ORIGIN - ty0 * 256 * r
    im = im.crop((int((bx0 - ox) / r), int((oy - by1) / r), int((bx1 - ox) / r), int((oy - by0) / r)))
    return im.resize((px, px), Image.LANCZOS), (mx, my, half)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    s3 = pick_cells()[2]                       # scene s3 (same rule and order as export_scenes.py)
    (tx, ty), _ = frame(s3.cell)               # scene centre, EPSG:2272 feet
    # the wide layer is centred halfway between City Hall and the scene, so both are in the opening view
    hx, hy = Transformer.from_crs(4326, 2272, always_xy=True).transform(*CITY_HALL)
    wx, wy = (hx + tx) / 2, (hy + ty) / 2
    meta = []
    for name, side, z, px in LAYERS:
        cx, cy = (wx, wy) if name == "wide" else (tx, ty)
        im, merc = mosaic(cx, cy, side, z, px)
        im = grade(im)
        im.save(OUT / f"{name}.webp", quality=80, method=6)
        meta.append({"name": name, "src": f"hero/{name}.webp", "v": int((OUT / f"{name}.webp").stat().st_mtime), "side_m": side,
                     "dx_m": round((cx - tx) * FT, 1), "dy_m": round((cy - ty) * FT, 1)})
        if name == "wide":   # small copy the cover draws first, while the 2 MB layer is still on its way
            im.resize((768, 768), Image.LANCZOS).save(OUT / "wide_preview.webp", quality=60, method=6)
            meta[-1]["preview"] = "hero/wide_preview.webp"
        print(name, im.size, (OUT / f"{name}.webp").stat().st_size // 1024, "KB")
    block = ROOT / "web/public/data/scenes/s3/photo_2025.webp"
    meta.append({"name": "block", "src": "scenes/s3/photo_2025.webp", "v": int(block.stat().st_mtime), "side_m": 256.0,
                 "dx_m": 0.0, "dy_m": 0.0})
    json.dump({"scene": "s3", "layers": meta}, open(OUT / "layers.json", "w"), indent=1)


if __name__ == "__main__":
    main()
