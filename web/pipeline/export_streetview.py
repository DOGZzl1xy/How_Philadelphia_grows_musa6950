"""The one street-level example of the story, stylised (-> web/public/data/street/, git-ignored).

    uv run python web/pipeline/export_streetview.py

Three street views of the same row of houses (2016, 2018, 2019), cut by scripts/stage8_photos.py and chosen by hand
from the buildings the author confirmed as taller: a two-storey rowhouse, the scaffold, the finished third storey.
Each photograph is reduced to the site's two tones (ink on paper) so that it reads as an illustration, and in the last
one the added storey is set in orange. No address or other text goes with it. Photographs: Google Street View.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "data/interim/stage8/views/19146"
OUT = ROOT / "web/public/data/street"
INK, PAPER = np.array([27, 42, 58], float), np.array([241, 238, 232], float)
O_DARK, O_LIGHT = np.array([150, 44, 8], float), np.array([255, 170, 120], float)
FRAMES = [("2016", "8777_0_2016-11.jpg", None),
          ("2018", "8777_1_2018-09.jpg", None),
          # the added storey in the 2019 photograph (pixels of the 720 px view)
          ("2019", "8777_1b_2019-10.jpg", [(0, 0), (352, 0), (352, 84), (540, 140), (548, 280), (362, 222), (0, 132)])]


def tone(img, poly):
    g = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(0.6)), float) / 255
    lo, hi = np.percentile(g, [2, 98])
    t = np.clip((g - lo) / (hi - lo), 0, 1)
    t = t * t * (3 - 2 * t)                                   # more contrast in the middle
    t = np.round(t * 7) / 7                                   # a few flat steps, like a print
    out = INK + (PAPER - INK) * t[..., None]
    if poly:
        m = Image.new("L", img.size, 0)
        ImageDraw.Draw(m).polygon(poly, fill=255)
        m = np.asarray(m.filter(ImageFilter.GaussianBlur(3)), float) / 255
        m = (m * np.clip((0.8 - t) / 0.2, 0, 1))[..., None]      # the dark cladding, not the sky around it
        out = out * (1 - m) + (O_DARK + (O_LIGHT - O_DARK) * t[..., None]) * m
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for year, f, poly in FRAMES:
        im = Image.open(SRC / f).convert("RGB")
        # the target mark of the cut view is painted out: sample the sky next to it
        px = im.load()
        for x in range(345, 376):
            for y in range(0, 20):
                px[x, y] = px[330, y]
        tone(im, poly).resize((1024, 1024), Image.LANCZOS).save(OUT / f"a_{year}.webp", quality=86, method=6)
    json.dump({"frames": [y for y, _, _ in FRAMES], "credit": "Google Street View"}, open(OUT / "index.json", "w"))
    print("written", [f"a_{y}.webp" for y, _, _ in FRAMES])


# ---------- the wall: 25 houses the author confirmed as taller, before and after ----------
# Chosen by hand from the blind check (review codes below): clear views without shop signs or house numbers.
# Two sheets of 5 x 5 tiles: wall_before.webp in ink, wall_after.webp in the site's orange.
WALL = [496, 468, 531, 911, 451, 395, 982, 685, 591, 242, 231, 620, 501, 622, 419, 463, 336, 637, 578, 422, 932, 244,
        307, 226, 674]
TILE = 256


def duo(img, dark, light=PAPER):
    g = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(0.6)), float) / 255
    lo, hi = np.percentile(g, [2, 98])
    t = np.clip((g - lo) / (hi - lo), 0, 1)
    t = np.round(t * t * (3 - 2 * t) * 7) / 7
    return Image.fromarray(np.clip(dark + (light - dark) * t[..., None], 0, 255).astype(np.uint8))


def wall():
    import pandas as pd
    S8 = ROOT / "data/interim/stage8"
    key = pd.read_csv(S8 / "map/review_key.csv", dtype={"zip": str}).set_index("code")
    sheets = [Image.new("RGB", (5 * TILE, 5 * TILE), tuple(PAPER.astype(int))) for _ in range(2)]
    for n, code in enumerate(WALL):
        z, unit = key.loc[code, "zip"], int(key.loc[code, "unit"])
        j = next(r for r in map(json.loads, open(S8 / f"judge/{z}_v1ob.jsonl")) if r["unit"] == unit)
        p = next(r for r in map(json.loads, open(S8 / f"photos/{z}.jsonl")) if r["unit"] == unit)
        ph = [x for x in p["photos"] if x["slot"] in j["slots"]]
        b = int(j["first_after"])
        a = int(j["last_before"]) if j.get("last_before") else b - 1
        for k, (x, dark) in enumerate(((ph[a - 1], INK), (ph[-1], O_DARK))):     # last unchanged photograph, latest photograph
            im = Image.open(S8 / f"views/{z}/{x['file']}").convert("RGB").crop((110, 70, 610, 570))
            sheets[k].paste(duo(im, dark).resize((TILE, TILE), Image.LANCZOS), ((n % 5) * TILE, (n // 5) * TILE))
    sheets[0].save(OUT / "wall_before.webp", quality=84, method=6)
    sheets[1].save(OUT / "wall_after.webp", quality=84, method=6)
    print("wall:", len(WALL), "houses")


if __name__ == "__main__":
    main()
    wall()
