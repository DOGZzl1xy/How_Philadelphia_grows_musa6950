"""Export the three storytelling scenes for the website (local data -> web/public/data/scenes/, git-ignored).

    uv run python web/pipeline/export_scenes.py [--refresh]

Scene rule (fixed before looking at any image): the three 250 m cells with the most LiDAR-measured new construction
2018-2025, outside high-rise cells, each in a different ZIP code, with LiDAR and model coverage >= 80% in every period.

Per scene (a 256 m square around the cell centre), all in one local pixel frame (no coordinates are written):
- photo_{year}.webp     graded aerial photo, 1024 px (0.25 m), years 2018-2020 and 2022-2025
- height_{year}.png     LiDAR height above ground, 512 px (0.5 m), 0.1 m per grey level (0-25.5 m), 0 = no data
- scene.json            building units as pixel polygons with LiDAR and model new-construction flags by year

Privacy: no address, parcel id, street name or coordinate leaves this script; pop-ups are not exported.
Imagery: City of Philadelphia aerial photography (3-inch tile services), credited on the website.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from PIL import Image
from pyproj import Transformer
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
import ortho_chips as O  # noqa: E402
from rasters import CELL, FT  # noqa: E402

OUT = ROOT / "web/public/data/scenes"
YEARS = [2018, 2019, 2020, 2022, 2023, 2024, 2025]
LIDAR_YEARS = [2018, 2022, 2025]
SIDE_M = 256.0
PHOTO_PX, HEIGHT_PX = 1024, 512
Z = 19                      # ~0.23 m ground resolution at Philadelphia's latitude
IMG_NORTH_SHIFT_M = 0.75    # imagery sits ~0.75 m north of LiDAR (global shift found in training, ck["shift"])
PAPER = np.array([241, 238, 232], np.float32)

to_merc = Transformer.from_crs(2272, 3857, always_xy=True)
to_2272 = Transformer.from_crs(3857, 2272, always_xy=True)
to_ll = Transformer.from_crs(2272, 4326, always_xy=True)


def pick_cells():
    c = pd.read_csv(ROOT / "results/citywide/stage6/cells_250m.csv")
    u = pd.read_parquet(ROOT / "data/interim/stage6_units.parquet", columns=["c250", "zip"])
    zip_of = u.groupby("c250").zip.agg(lambda s: s.mode().iloc[0])
    ok = (~c.high_rise.astype(bool) & (c.lidar_cov_2018_2022 >= 0.8) & (c.lidar_cov_2022_2025 >= 0.8)
          & (c[[k for k in c.columns if k.startswith("model_cov_")]] >= 0.8).all(axis=1))
    c = c[ok].assign(total=lambda d: d.lidar_new_2018_2022 + d.lidar_new_2022_2025, zip=lambda d: d.cell.map(zip_of))
    picked, zips = [], set()
    for r in c.sort_values(["total", "cell"], ascending=[False, True]).itertuples():
        if r.zip not in zips:
            picked.append(r)
            zips.add(r.zip)
        if len(picked) == 3:
            break
    return picked


def frame(cell):
    """Square 256 m frame around the cell centre: centre in EPSG:2272 and the matching Web Mercator half-width."""
    s = 250 / FT
    i, j = (int(v) for v in cell.split("_"))
    cx, cy = (i + 0.5) * s, (j + 0.5) * s
    lat = to_ll.transform(cx, cy)[1]
    half_merc = SIDE_M / 2 / np.cos(np.radians(lat))
    mx, my = to_merc.transform(cx, cy)
    return (cx, cy), (mx, my, half_merc, lat)


def pixel_grid(merc, n):
    """EPSG:2272 coordinates of the centres of an n x n pixel grid over the frame (row 0 = north)."""
    mx, my, half, _ = merc
    step = 2 * half / n
    xs = mx - half + (np.arange(n) + 0.5) * step
    ys = my + half - (np.arange(n) + 0.5) * step
    X, Y = np.meshgrid(xs, ys)
    return to_2272.transform(X, Y)


def grade(img: Image.Image) -> Image.Image:
    """Documentary grade shared by every photo on the site: 35% desaturated, lifted blacks, 10% paper tint."""
    x = np.asarray(img, np.float32)
    g = x.mean(2, keepdims=True)
    y = 0.65 * x + 0.35 * g
    y = 20 + 0.86 * y
    y = 0.9 * y + 0.1 * PAPER
    return Image.fromarray(np.clip(y, 0, 255).astype(np.uint8))


def photo(year, merc):
    mx, my, half, lat = merc
    my = my + IMG_NORTH_SHIFT_M / np.cos(np.radians(lat))  # sample imagery 0.75 m further north
    r = O._res(Z)
    bx0, by0, bx1, by1 = mx - half, my - half, mx + half, my + half
    tx0, tx1 = int((bx0 + O.ORIGIN) / (256 * r)), int((bx1 + O.ORIGIN) / (256 * r))
    ty0, ty1 = int((O.ORIGIN - by1) / (256 * r)), int((O.ORIGIN - by0) / (256 * r))
    mosaic = Image.new("RGB", ((tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256))
    blank = 0
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            t = O.tile(year, Z, tx, ty)
            blank += np.asarray(t).std() < 1
            mosaic.paste(t, ((tx - tx0) * 256, (ty - ty0) * 256))
    ox, oy = tx0 * 256 * r - O.ORIGIN, O.ORIGIN - ty0 * 256 * r
    img = mosaic.crop((int((bx0 - ox) / r), int((oy - by1) / r), int((bx1 - ox) / r), int((oy - by0) / r)))
    return grade(img.resize((PHOTO_PX, PHOTO_PX), Image.LANCZOS)), blank


def height(year, zips, merc):
    X, Y = pixel_grid(merc, HEIGHT_PX)
    out = np.full(X.shape, np.nan, np.float32)
    for z in zips:
        f = ROOT / f"data/interim/citywide_rasters/{z}_{year}.npz"
        if not f.exists():
            continue
        d = np.load(f)
        r = ((float(d["y1"]) - Y) / CELL).astype(np.int64)
        c = ((X - float(d["x0"])) / CELL).astype(np.int64)
        ok = (r >= 0) & (r < int(d["ny"])) & (c >= 0) & (c < int(d["nx"])) & np.isnan(out)
        if not ok.any():
            continue  # this ZIP's raster does not reach the frame: skip loading its arrays
        nd, veg = d["ndsm"], d["veg"]
        v = np.full(X.shape, np.nan, np.float32)
        v[ok] = nd[r[ok], c[ok]]
        v[ok & (veg[r.clip(0, int(d["ny"]) - 1), c.clip(0, int(d["nx"]) - 1)] > 0.5)] = 0  # trees -> ground
        out = np.where(np.isnan(out), v, out)
        if not np.isnan(out).any():
            break
    q = np.where(np.isnan(out), 0, np.clip(np.round(out * 10), 1, 255)).astype(np.uint8)
    return Image.fromarray(q, "L")


def units(cell_zip, center, merc):
    cx, cy = center
    half_ft = SIDE_M / 2 / FT
    win = box(cx - half_ft, cy - half_ft, cx + half_ft, cy + half_ft)
    flags = pd.read_parquet(ROOT / "data/interim/stage6_units.parquet")
    geo = []
    for z in sorted(flags.zip.unique()):
        f = ROOT / f"data/interim/citywide_units/{z}.parquet"
        g = gpd.read_parquet(f, columns=["unit", "geometry", "in_mask"])
        g = g[g.in_mask & g.intersects(win)]
        if len(g):
            geo.append(g.assign(zip=z))
    g = gpd.GeoDataFrame(pd.concat(geo), crs=2272).merge(flags, on=["zip", "unit"], how="left")
    mx, my, half, _ = merc
    px = PHOTO_PX / (2 * half)
    feats = []
    for r in g.itertuples():
        geom = r.geometry.intersection(win).simplify(0.6)
        if geom.is_empty:
            continue
        polys = [geom] if geom.geom_type == "Polygon" else [p for p in getattr(geom, "geoms", []) if p.geom_type == "Polygon"]
        rings = []
        for p in polys:
            x, y = p.exterior.xy
            X, Y = to_merc.transform(np.asarray(x), np.asarray(y))
            rings.append([[round(float((a - (mx - half)) * px), 1), round(float(((my + half) - b) * px), 1)]
                          for a, b in zip(X, Y)])

        def f(col):
            v = getattr(r, col, None)
            return bool(v) if v is not None and v == v else None
        lidar_new = {"2018_2022": f("L2018_2022_new"), "2022_2025": f("L2022_2025_new")}
        model_new = {str(y): f(f"M{a}_{y}_new") for a, y in ((2018, 2019), (2018, 2020), (2022, 2023), (2022, 2024))}
        feats.append({"rings": rings, "lidar_new": lidar_new, "model_new": model_new})
    return feats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-export scenes that already exist")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    cells = pick_cells()
    index = []
    for k, cell in enumerate(cells, 1):
        sid = f"s{k}"
        d = OUT / sid
        d.mkdir(exist_ok=True)
        center, merc = frame(cell.cell)
        meta = {"id": sid, "side_m": SIDE_M, "photo_px": PHOTO_PX, "height_px": HEIGHT_PX,
                "lidar_new_2018_2022": int(cell.lidar_new_2018_2022), "lidar_new_2022_2025": int(cell.lidar_new_2022_2025),
                "years": YEARS, "lidar_years": LIDAR_YEARS}
        if (d / "scene.json").exists() and not a.refresh:
            index.append(meta)
            print(sid, "exists, skipped")
            continue
        for y in YEARS:
            im, blank = photo(y, merc)
            im.save(d / f"photo_{y}.webp", quality=82, method=6)
            print(sid, y, "photo", "blank tiles:", blank)
        zips = sorted(pd.read_parquet(ROOT / "data/interim/stage6_units.parquet", columns=["c250", "zip"])
                      .query("c250 == @cell.cell").zip.unique().tolist() + [cell.zip])
        nb = sorted({p.stem.split("_")[0] for p in (ROOT / "data/interim/citywide_rasters").glob("*_2022.npz")})
        for y in LIDAR_YEARS:
            height(y, zips + [z for z in nb if z not in zips], merc).save(d / f"height_{y}.png", optimize=True)
            print(sid, y, "height")
        feats = units(cell.zip, center, merc)
        json.dump({**meta, "units": feats}, open(d / "scene.json", "w"), separators=(",", ":"))
        print(sid, len(feats), "units")
        index.append(meta)
    json.dump(index, open(OUT / "index.json", "w"), indent=1)


if __name__ == "__main__":
    main()
