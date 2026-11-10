"""Re-download the site's generated assets (public/data/) from the live deployment.

    python web/pipeline/pull_live_data.py

The export scripts in this folder need LiDAR rasters and imagery tiles that are no longer on disk (2026-11-07), so the
deployed copy is the source for public/data/. Files are read from the manifests (hero/layers.json, scenes/*/scene.json).
"""

import json
import pathlib
import urllib.request

BASE = "https://musa6950-philly-growth.xuanyuzhou.org/data/"
OUT = pathlib.Path(__file__).resolve().parents[1] / "public/data"


def get(p):
    req = urllib.request.Request(BASE + p, headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(req) as r:
        b = r.read()
    f = OUT / p
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(b)
    return b


files = ["hero/layers.json", "scenes/index.json"] \
    + [f"model/{n}" for n in ("training.json", "backbones.json", "zips.geojson")] \
    + [f"results/{n}" for n in ("test_cells.json", "cells.geojson", "yearly.json", "rail.json", "permits.json",
                                "income.json", "area_type.json")] \
    + [f"explore/{n}.json" for n in ("cells", "bgs", "zips", "hoods", "city", "tables")]
for p in files:
    get(p)
for layer in json.load(open(OUT / "hero/layers.json"))["layers"]:
    get(layer["src"])
    if layer.get("preview"):
        get(layer["preview"])
for s in ("s1", "s2", "s3"):
    m = json.loads(get(f"scenes/{s}/scene.json"))
    for y in m["years"]:
        get(f"scenes/{s}/photo_{y}.webp")
    for y in m["lidar_years"]:
        get(f"scenes/{s}/height_{y}.png")
fs = [f for f in OUT.rglob("*") if f.is_file()]
print(len(fs), "files", round(sum(f.stat().st_size for f in fs) / 1e6, 1), "MB")
