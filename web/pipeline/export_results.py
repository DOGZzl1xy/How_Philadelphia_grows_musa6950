"""Results assets for acts 4-5 (-> web/public/data/results/, git-ignored). Everything is aggregated.

    POPUP_DATA=citywide uv run python web/pipeline/export_results.py

- test_cells.json   sealed test 2022->2025: calibrated model vs LiDAR new construction per 250 m cell (counts only)
- cells.geojson     250 m cells with LiDAR new construction 2018-2025 (rate per 1,000 units per year), outside
                    high-rise cells, as lon/lat squares
- yearly.json       new construction per 1,000 units per year on one fixed set of units (report Table "When")
- rail.json         rail-type stops (GTFS route types 0-2) as lon/lat points
- permits.json      new-construction permits issued 2018-2020: share with visible construction by 2025, and the
                    cumulative share by years after issue
"""

import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import box
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.append(str(ROOT / "scripts"))
from rasters import FT  # noqa: E402

OUT = ROOT / "web/public/data/results"
OUT.mkdir(parents=True, exist_ok=True)
S7 = ROOT / "results/citywide/stage7"

# 1. sealed test, per 250 m cell (same computation as report Figure 5)
import m4_test as T  # noqa: E402  helpers only; the test is not run again

df = pd.read_parquet(ROOT / "data/interim/unitcls_preds/m4s_s0_ROUND2_2022_2025.parquet")
thr = {"grew": float(df.thr_grew.iloc[0]), "popup": float(df.thr_popup.iloc[0])}
d = T.geography(T.model_flags(T.with_truth(df, "lidar_change_city", 2022, 2025), thr))
hr = pd.read_csv(ROOT / "results/citywide/highrise_all.csv")
d = d[~d.c100.isin(set(hr[(hr.unit == "c100") & hr.flagged].key))]
fac = json.load(open(ROOT / "results/citywide/m4/round2_test.json"))["models"]["m4s_s0"]["calibration_from_validation"]["new"]["factor"]
agg = d.groupby("c250").agg(m=("m_new", "sum"), t=("t_new", "sum"))
cells = [{"lidar": int(r.t), "model": round(float(r.m) * fac, 2)} for r in agg.itertuples()]
r = float(np.corrcoef([c["lidar"] for c in cells], [c["model"] for c in cells])[0, 1])
json.dump({"r": round(r, 2), "n_cells": len(cells), "lidar_total": int(agg.t.sum()),
           "model_total": round(float(agg.m.sum()) * fac), "cells": cells}, open(OUT / "test_cells.json", "w"))
print("test r", round(r, 3), len(cells))

# 2. 250 m cells, LiDAR new construction 2018-2025
c = pd.read_csv(S7 / "rq2_cells_250m.csv")
c = c[(c.units >= 10) & c.new_rate.notna() & (c.new_all > 0)]   # only blocks with new construction are drawn
s = 250 / FT
geom = [box(int(k.split("_")[0]) * s, int(k.split("_")[1]) * s, (int(k.split("_")[0]) + 1) * s, (int(k.split("_")[1]) + 1) * s)
        for k in c.cell]
g = gpd.GeoDataFrame({"rate": c.new_rate.round(2).to_numpy(), "n": c.new_all.astype(int).to_numpy()}, geometry=geom, crs=2272)
g = g.to_crs(4326)
g["geometry"] = [orient(p, sign=-1.0) for p in g.geometry]   # clockwise rings: d3-geo reads CCW squares as "everything else"
g.to_file(OUT / "cells.geojson", driver="GeoJSON", COORDINATE_PRECISION=5)
print("cells", len(g), "with new construction", int((g.n > 0).sum()))

# 3. yearly series on one fixed set of units
y = pd.read_csv(S7 / "rq2_yearly_new_shared_units.csv")
lab = {2019: "2019", 2020: "2020", 2022: "2021–22", 2023: "2023", 2024: "2024", 2025: "2025"}
json.dump({"units": int(y.units.iloc[0]), "years": [{"label": lab[int(r.year)], "rate": round(float(r.per_1000_per_year), 2),
                                                     "model": r.source == "model"} for r in y.itertuples()]},
          open(OUT / "yearly.json", "w"), indent=1)

# 4. rail-type stops
from stage7_rq2 import rail_and_bus_stops  # noqa: E402

rail, _ = rail_and_bus_stops()
pts = gpd.GeoSeries(gpd.points_from_xy(rail[:, 0], rail[:, 1]), crs=2272)
city = gpd.read_file(ROOT / "data/raw/boundaries/zip_codes.geojson").to_crs(2272).union_all()
pts = pts[pts.within(city)].to_crs(4326)                     # stops inside the city only
json.dump([[round(p.x, 5), round(p.y, 5)] for p in pts], open(OUT / "rail.json", "w"))
print("rail stops", len(pts))

# 5. permits
a = pd.read_csv(S7 / "rq3_permit_to_construction.csv")
tt = pd.read_csv(S7 / "rq3_time_to_detection.csv")
print(a.head(6).to_string())
json.dump({"curves": [{"year": int(r.issue_year), "n": int(r.units),
                       "share": [round(float(getattr(r, f"detected_within_{k}y")), 3) for k in range(0, 7) if r.issue_year + k <= 2025]}
                      for r in tt.itertuples()]}, open(OUT / "permits.json", "w"), indent=1)

# 6. who: new construction by block-group income quintile (level 2015-19, real change to 2019-23)
inc = pd.read_csv(S7 / "rq2_rates_by_income.csv")
json.dump({k: [round(float(v), 2) for v in inc[inc.by.str.startswith(p)].new_per_1000_per_year]
           for k, p in (("level", "baseline"), ("change", "real income"))}, open(OUT / "income.json", "w"))

# 7. what kind of street: new construction per 1,000 lots per year by area type, both LiDAR periods
at = pd.read_csv(S7 / "rq2_rates_by_area_type.csv")
order = {"mixed": "Mixed use", "rowhouse": "Rowhouse", "detached": "Detached houses"}
json.dump([{"type": order[k], "periods": [{"period": r.period, "rate": round(float(r.new_per_1000_per_year), 2)}
                                          for r in at[at.area_type == k].itertuples()]} for k in order],
          open(OUT / "area_type.json", "w"), indent=1)
print("income + area type")

