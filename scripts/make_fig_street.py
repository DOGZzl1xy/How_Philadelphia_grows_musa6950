"""Report Figure 9: the buildings seen taller from the street 2018-2025, on the hot cells of stage 8.

Reads the local map table (data/interim/stage8/map/buildings.csv), the unit outlines and
results/citywide/stage8/hot_cells.csv; writes report/figs/street_map.png (dots only, no address).
Run: uv run python scripts/make_fig_street.py
"""
from pathlib import Path

import geopandas as gpd
import matplotlib
import pandas as pd
from shapely.geometry import box

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
FT = 0.3048006096

t = pd.read_csv(ROOT / "data/interim/stage8/map/buildings.csv", dtype={"zip": str})
m = t[t.cls.isin(["t1", "t2", "t3"])]
pts = []
for z, g in m.groupby("zip"):
    u = gpd.read_parquet(ROOT / f"data/interim/citywide_units/{z}.parquet")[["unit", "geometry"]]
    pts.append(u[u.unit.isin(g.unit)].geometry.centroid)
pts = gpd.GeoSeries(pd.concat(pts), crs=2272)
hot = pd.read_csv(ROOT / "results/citywide/stage8/hot_cells.csv")
s = 250 / FT
cells = gpd.GeoSeries([box(int(c.split("_")[0]) * s, int(c.split("_")[1]) * s, (int(c.split("_")[0]) + 1) * s,
                           (int(c.split("_")[1]) + 1) * s) for c in hot.cell], crs=2272)
zips = gpd.read_file(ROOT / "data/raw/boundaries/zip_codes.geojson").to_crs(2272)

fig, ax = plt.subplots(figsize=(6.2, 6.2), dpi=300)
zips.plot(ax=ax, color="#ece8df", edgecolor="#ffffff", linewidth=0.5)
cells.plot(ax=ax, color="#c9cdd2", edgecolor="none")
pts.plot(ax=ax, color="#e8501a", markersize=1.6, linewidth=0)
x0, y0, x1, y1 = cells.total_bounds
pad = 3000
ax.set_xlim(x0 - pad, x1 + pad)
ax.set_ylim(y0 - pad, y1 + pad)
ax.set_axis_off()
ax.set_aspect("equal")
fig.savefig(ROOT / "report/figs/street_map.png", bbox_inches="tight", pad_inches=0.02, facecolor="white")
print("buildings", len(pts), "hot cells", len(cells))
