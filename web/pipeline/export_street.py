"""Stage 8 assets for the story (-> web/public/data/results/, git-ignored).

    uv run python web/pipeline/export_street.py

- street.json   the buildings seen taller from the street 2018-2025 as points (lot centroid and the period in which the
                change first appears; no address, no id), the numbers of the stage and of the author's check by hand
- income.json   gains the added-storey rates by block-group income quintile next to the new-construction rates

Needs the local map table of stage 8 (data/interim/stage8/map/buildings.csv, scripts/stage8_map.py). Street-level
photographs are not exported.
"""
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web/public/data/results"
S7, S8 = ROOT / "results/citywide/stage7", ROOT / "results/citywide/stage8"

t = pd.read_csv(ROOT / "data/interim/stage8/map/buildings.csv", dtype={"zip": str})
m = t[t.cls.isin(["t1", "t2", "t3"])]
pts = []
for z, g in m.groupby("zip"):
    u = gpd.read_parquet(ROOT / f"data/interim/citywide_units/{z}.parquet")[["unit", "geometry"]]
    u = u[u.unit.isin(g.unit)]
    c = gpd.GeoSeries(u.geometry.centroid, crs=2272).to_crs(4326)
    k = g.set_index("unit").cls.map({"t1": 0, "t2": 1, "t3": 2})
    pts += [[round(p.x, 5), round(p.y, 5), int(k[uid])] for uid, p in zip(u.unit, c)]
check = json.loads((S8 / "review_marked.json").read_text())
sealed = json.loads((S8 / "eval_sealed.json").read_text())
hot = t[t.hot]
json.dump({"marked": len(m), "by_period": [int((m.cls == c).sum()) for c in ("t1", "t2", "t3")],
           "periods": ["2018–2019", "2020–2023", "2024–2025"],
           "hot_cells": int(len(pd.read_csv(S8 / "hot_cells.csv"))), "candidates": int(len(hot)),
           "judged": int((~hot.cls.isin(["nophoto", "pending"])).sum()),
           "check": {"of": check["of"], "taller": check["taller_confirmed"]},
           "sealed_r": round(sealed["r_250m"], 2), "points": pts}, open(OUT / "street.json", "w"), separators=(",", ":"))
print("street.json:", len(pts), "points")

inc = pd.read_csv(S7 / "rq2_rates_by_income.csv")
d = {}
for k, p in (("level", "baseline"), ("change", "real income")):
    r = inc[inc.by.str.startswith(p)]
    d[k] = [round(float(v), 2) for v in r.new_per_1000_per_year]
    d["popup_" + k] = [round(float(v), 2) for v in r.popup_per_1000_per_year]
json.dump(d, open(OUT / "income.json", "w"))
print("income.json:", d)
