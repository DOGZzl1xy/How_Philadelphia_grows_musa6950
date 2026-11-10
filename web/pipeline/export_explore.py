"""Explore page assets (-> web/public/data/explore/, git-ignored). Aggregated only: 250 m cells, block groups, ZIP
codes and neighbourhoods; no unit, parcel or address. Map files carry lon/lat geometry for drawing; tables.json has no
geometry at all (the assistant names areas, the page looks them up and flies there).

    uv run python web/pipeline/export_explore.py        # from the repository root

- cells.json      250 m cells (columns + rows + corner lon/lat; the page builds the GeoJSON) of the study area: LiDAR change per period (new, pop-up, demolition, covered units) and
                  model estimates of new construction per year on the stage-6 unit sets (2021-22 and 2025 are LiDAR
                  minus model)
- bgs.json        2019 block groups: stage-7 fields (rail distance, LiDAR events, ACS income / population / rent) plus
                  the Explore ACS tables (tenure, vacancy, year built, race / ethnicity, commute), 2015-19 and
                  2019-23 interpolated onto 2019 block groups by area share
- zips.json       ZIP codes of the study area: rates per period, share of changes without a permit
- hoods.json      neighbourhood outlines (OpenDataPhilly), names only
- tracts.json     census tracts (2010 boundaries, the ones of the 2019 block groups), outlines; numbers in tables.json
- city.json       city outline (union of ZIP codes), to mask the aerial photograph outside the city
- tables.json     the numbers of all layers as {cols, rows} tables keyed by id (cells: only those with any change),
                  plus city-wide results, where each neighbourhood / ZIP code lies in words (direction and distance from
                  City Hall, neighbours) and named rail stations (subway / elevated, regional rail) with their
                  neighbourhood; read by the page's panel and by the assistant (no geometry, no coordinates)
"""

import io
import json
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import requests
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))
sys.path.append(str(ROOT / "scripts"))
from rasters import FT  # noqa: E402

OUT = ROOT / "web/public/data/explore"
OUT.mkdir(parents=True, exist_ok=True)
S6, S7 = ROOT / "results/citywide/stage6", ROOT / "results/citywide/stage7"
RAW = ROOT / "data/raw"
HOODS_URL = ("https://raw.githubusercontent.com/opendataphilly/open-geo-data/master/philadelphia-neighborhoods/"
             "philadelphia-neighborhoods.geojson")
YEARS = {"2018_2022": 4, "2022_2025": 3}


def r(x, k=2):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else round(float(x), k)


# ---------- areas ----------
zips = gpd.read_file(RAW / "boundaries/zip_codes.geojson").to_crs(2272)
zcol = "code"
zips = zips.rename(columns={zcol: "zip"})[["zip", "geometry"]]
zips["zip"] = zips["zip"].astype(str)
zips = zips.dissolve("zip").reset_index()
hood_file = RAW / "boundaries/philadelphia-neighborhoods.geojson"
if not hood_file.exists():
    hood_file.write_bytes(requests.get(HOODS_URL, timeout=120).content)
    (RAW / "boundaries/SOURCE_neighborhoods.txt").write_text(
        f"{HOODS_URL}; downloaded {pd.Timestamp.now():%Y-%m-%d}\n")
hoods = gpd.read_file(hood_file).to_crs(2272).rename(columns={"MAPNAME": "name"})[["name", "geometry"]]
hoods = hoods.dissolve("name").reset_index()

# ---------- 250 m cells ----------
c6 = pd.read_csv(S6 / "cells_250m.csv")
s = 250 / FT
ij = c6.cell.str.split("_", expand=True).astype(int)
cells = gpd.GeoDataFrame(c6, geometry=[box(i * s, j * s, (i + 1) * s, (j + 1) * s) for i, j in zip(ij[0], ij[1])],
                         crs=2272)
cent = cells.geometry.centroid
cells["zip"] = gpd.sjoin(gpd.GeoDataFrame(geometry=cent, crs=2272), zips, predicate="within", how="left") \
    .groupby(level=0).zip.first()
cells["hood"] = gpd.sjoin(gpd.GeoDataFrame(geometry=cent, crs=2272), hoods, predicate="within", how="left") \
    .groupby(level=0).name.first()
# model years: increments of the cumulative series on the stage-6 unit sets (A: 2018 anchor, B: 2022 anchor)
inc = {"2019": cells.A_new_2019, "2020": cells.A_new_2020 - cells.A_new_2019, "2021_22": cells.A_new_2022 - cells.A_new_2020,
       "2023": cells.B_new_2023, "2024": cells.B_new_2024 - cells.B_new_2023, "2025": cells.B_new_2025 - cells.B_new_2024}
cp = pd.DataFrame({"id": cells.cell, "units": cells.units, "hr": cells.high_rise.astype(int), "zip": cells.zip,
                   "hood": cells.hood})
for p in YEARS:
    q = p[2:4]                                           # 18 / 22
    cp[f"cov{q}"] = (cells[f"lidar_cov_{p}"] * cells.units).round().astype(int)
    for k, short in (("new", "n"), ("popup", "p"), ("demo", "d")):
        cp[f"{short}{q}"] = cells[f"lidar_{k}_{p}"].astype(int)
cp["au"], cp["bu"] = cells.A_units, cells.B_units
for y, v in inc.items():
    cp[f"y{y}"] = v.round(2)
cells_out = gpd.GeoDataFrame(cp, geometry=cells.geometry, crs=2272)
cells_out = cells_out[cells_out.units > 0]

# ---------- block groups (2019 geography) ----------
bg7 = pd.read_csv(S7 / "rq2_block_groups.csv", dtype={"bg": str})
with zipfile.ZipFile(RAW / "boundaries/tl_2019_42_bg.zip") as zf:
    shp = next(n for n in zf.namelist() if n.endswith(".shp"))
b19 = gpd.read_file(f"zip://{RAW / 'boundaries/tl_2019_42_bg.zip'}!{shp}")
b19 = b19[b19.COUNTYFP == "101"].to_crs(2272)[["GEOID", "geometry"]].rename(columns={"GEOID": "bg"})


def acs_counts(year):
    a = pd.read_csv(RAW / f"acs/acs5_{year}_bg_philadelphia_extra.csv", dtype={"geoid": str})
    a = a[["geoid"] + [c for c in a.columns if "_E" in c]]
    for c in a.columns[1:]:
        a[c] = pd.to_numeric(a[c], errors="coerce")
        a.loc[a[c] < 0, c] = np.nan
    return a


def shares(a):
    """Counts -> the panel's indicators (shares of the table total)."""
    def sh(num, den):
        return np.where(a[den] > 0, a[num].sum(axis=1) / a[den], np.nan) if isinstance(num, list) \
            else np.where(a[den] > 0, a[num] / a[den], np.nan)
    return pd.DataFrame({
        "renter": sh("B25003_E003", "B25003_E001"),
        "vacant": sh("B25002_E003", "B25002_E001"),
        "built2010": sh(["B25034_E002", "B25034_E003"], "B25034_E001"),
        "pre1940": sh("B25034_E011", "B25034_E001"),
        "black": sh("B03002_E004", "B03002_E001"),
        "white": sh("B03002_E003", "B03002_E001"),
        "hispanic": sh("B03002_E012", "B03002_E001"),
        "asian": sh("B03002_E006", "B03002_E001"),
        "transit": sh("B08301_E010", "B08301_E001"),
        "walk": sh(["B08301_E018", "B08301_E019"], "B08301_E001"),
        "car": sh("B08301_E002", "B08301_E001"),
        "wfh": sh("B08301_E021", "B08301_E001"),
    }, index=a.index)


a19 = acs_counts(2019).rename(columns={"geoid": "bg"}).set_index("bg")
a23 = acs_counts(2023)
with zipfile.ZipFile(RAW / "boundaries/tl_2020_42_bg.zip") as zf:
    shp = next(n for n in zf.namelist() if n.endswith(".shp"))
b20 = gpd.read_file(f"zip://{RAW / 'boundaries/tl_2020_42_bg.zip'}!{shp}")
b20 = b20[b20.COUNTYFP == "101"].to_crs(2272)[["GEOID", "geometry"]].merge(a23, left_on="GEOID", right_on="geoid")
b20["src_area"] = b20.area
ov = gpd.overlay(b19, b20, how="intersection")
w = ov.area / ov.src_area
cnt = [c for c in a23.columns if "_E" in c]
i23 = (ov[cnt].mul(w, axis=0).assign(bg=ov.bg).groupby("bg").sum(min_count=1))   # counts by area share
sh19, sh23 = shares(a19), shares(i23)
bg = b19.merge(bg7, on="bg", how="inner")
keep7 = {"units": "units", "rail_m": "rail_m", "rowhouse": "rowhouse", "cov_2018_2022": "cov18", "cov_2022_2025": "cov22",
         "new_2018_2022": "n18", "popup_2018_2022": "p18", "new_2022_2025": "n22", "popup_2022_2025": "p22",
         "pop19": "pop19", "pop23": "pop23", "inc19_real23": "inc19", "inc23": "inc23", "rent19": "rent19",
         "rent23": "rent23", "inc_change": "inc_chg", "pop_change": "pop_chg"}
bp = bg[["bg"] + list(keep7)].rename(columns=keep7)
for k in ("pop19", "pop23", "inc19", "inc23", "rent19", "rent23", "rail_m"):
    bp[k] = bp[k].round()
for k in ("rowhouse", "inc_chg", "pop_chg"):
    bp[k] = bp[k].round(3)
for k in sh19.columns:
    bp[f"{k}19"] = bp.bg.map(sh19[k]).round(3)
    bp[f"{k}23"] = bp.bg.map(sh23[k]).round(3)
bc = bg.geometry.representative_point()
bp["zip"] = gpd.sjoin(gpd.GeoDataFrame(geometry=bc, crs=2272), zips, predicate="within", how="left").groupby(level=0).zip.first()
bp["hood"] = gpd.sjoin(gpd.GeoDataFrame(geometry=bc, crs=2272), hoods, predicate="within", how="left").groupby(level=0).name.first()
bgs_out = gpd.GeoDataFrame(bp, geometry=bg.geometry.simplify(25), crs=2272)

# ---------- census tracts (2010 boundaries, as the 2019 block groups): block groups added up ----------
def tract_name(code):
    """Census tract name from its 6-digit code: 003001 -> 30.01, 000100 -> 1."""
    return f"{int(code[:4])}" + (f".{code[4:]}" if code[4:] != "00" else "")


bp["tract"] = bp.bg.str[5:11].map(tract_name)
tg = bp.groupby("tract")
tp = pd.DataFrame({k: tg[k].sum() for k in ("units", "cov18", "cov22", "n18", "p18", "n22", "p22", "pop19", "pop23")})
for k in sh19.columns.tolist() + ["inc", "rent"]:
    for y, w in (("19", "pop19"), ("23", "pop23")):
        col = f"{k}{y}"
        ok = bp[col].notna() & (bp[w] > 0)
        tp[col] = (bp[ok][col] * bp[ok][w]).groupby(bp[ok].tract).sum() / bp[ok][w].groupby(bp[ok].tract).sum()
        tp[col] = tp[col].round(0 if k in ("inc", "rent") else 3)
tp["inc_chg"] = (tp.inc23 / tp.inc19 - 1).round(3)
tp["pop_chg"] = (tp.pop23 / tp.pop19 - 1).round(3)
big = bp.sort_values("units", ascending=False).drop_duplicates("tract").set_index("tract")
tp["zip"], tp["hood"] = big.zip, big.hood
c6bg = pd.read_csv(S6 / "cells_bg.csv", dtype={"cell": str})
c6bg = c6bg[~c6bg.high_rise.astype(bool)]
c6bg["tract"] = c6bg.cell.str[5:11].map(tract_name)
inc_t = {"2019": c6bg.A_new_2019, "2020": c6bg.A_new_2020 - c6bg.A_new_2019, "2021_22": c6bg.A_new_2022 - c6bg.A_new_2020,
         "2023": c6bg.B_new_2023, "2024": c6bg.B_new_2024 - c6bg.B_new_2023, "2025": c6bg.B_new_2025 - c6bg.B_new_2024}
tp["au"], tp["bu"] = c6bg.groupby("tract").A_units.sum(), c6bg.groupby("tract").B_units.sum()
for y, v in inc_t.items():
    tp[f"y{y}"] = v.groupby(c6bg.tract).sum().round(2)
tp = tp.reset_index().rename(columns={"index": "tract"})
tracts_geo = gpd.GeoDataFrame(bp[["tract"]], geometry=bg.geometry.values, crs=2272).dissolve("tract").reset_index()
tracts_geo["geometry"] = tracts_geo.geometry.simplify(25)
print(f"  tracts: {len(tp)} (2010 boundaries), from {len(bp)} block groups", flush=True)

# ---------- ZIP codes ----------
rz = pd.read_csv(S7 / "rq2_rates_by_zip.csv", dtype={"zip": str})
uz = pd.read_csv(S7 / "rq3_unpermitted_by_zip.csv", dtype={"zip": str})
zt = pd.read_csv(ROOT / "results/citywide/zip_area_types.csv", dtype={"zip": str})
zp = pd.DataFrame({"zip": sorted(set(rz.zip))})
for per, q in (("2018–2022", "18"), ("2022–2025", "22")):
    x = rz[rz.period == per].set_index("zip")
    zp[f"cov{q}"] = zp.zip.map(x.covered_units)
    for k, short in (("new", "n"), ("popup", "p"), ("demo", "d")):
        zp[f"{short}{q}"] = zp.zip.map(x[f"{k}_events"])
        zp[f"{short}{q}_rate"] = zp.zip.map(x[f"{k}_per_1000_per_year"]).round(2)
for ev in ("new", "popup"):
    x = uz[uz.event == ev].set_index("zip")
    zp[f"noperm_{ev}"] = zp.zip.map(x.without_permit)
    zp[f"noperm_{ev}_of"] = zp.zip.map(x.events)
zp["type"] = zp.zip.map(zt.set_index("zip").type)
zp["units"] = zp.zip.map(cells_out.groupby("zip").units.sum())
YCOLS = ["au", "bu"] + [c for c in cp.columns if c.startswith("y")]       # model-year estimates and their lot sets
main = cells_out[cells_out.hr == 0]                                       # high-rise cells stay out, as in the results
zp["hr_units"] = zp.zip.map(cells_out[cells_out.hr == 1].groupby("zip").units.sum()).fillna(0).astype(int)
for c in YCOLS:
    zp[c] = zp.zip.map(main.groupby("zip")[c].sum()).round(2)
zips_out = zips.merge(zp, on="zip", how="inner")
zips_out["geometry"] = zips_out.geometry.simplify(20)

# ---------- neighbourhoods ----------
hn = cells_out[cells_out.hr == 0].groupby("hood")                  # high-rise cells are left out, as in the results
hp = pd.DataFrame({"units": cells_out.groupby("hood").units.sum()})
hp["hr_units"] = cells_out[cells_out.hr == 1].groupby("hood").units.sum().reindex(hp.index).fillna(0).astype(int)
for c in ("cov18", "cov22", "n18", "n22", "p18", "p22", "d18", "d22"):
    hp[c] = hn[c].sum().reindex(hp.index).fillna(0)
for c in YCOLS:
    hp[c] = main.groupby("hood")[c].sum().reindex(hp.index).round(2)
hp = hp.reset_index().rename(columns={"hood": "name"})
hoods_out = hoods.merge(hp, on="name", how="inner")
hoods_out["geometry"] = hoods_out.geometry.simplify(20)

print("writing map layers", flush=True)


def table(df, key):
    """{cols, rows}: one array per record (compact; the page and the Worker rebuild objects)."""
    df = df.drop(columns="geometry", errors="ignore").astype(object).where(df.notna(), None)
    cols = [key] + [c for c in df.columns if c != key]
    return {"cols": cols, "rows": df[cols].values.tolist()}


def corners(g):
    """lon/lat of the four corners of each square cell, flat, 5 decimals."""
    out = []
    for poly in g.to_crs(4326).geometry:
        out.append([round(v, 5) for xy in list(poly.exterior.coords)[:4] for v in xy])
    return out


def dump(obj, name):
    json.dump(obj, open(OUT / name, "w"), separators=(",", ":"), allow_nan=False)
    print(f"  {name}: {(OUT / name).stat().st_size / 1e3:.0f} KB", flush=True)


dump({**table(cells_out, "id"), "corners": corners(cells_out)}, "cells.json")
city = gpd.GeoDataFrame({"id": ["city"]}, geometry=[zips.union_all().buffer(30).buffer(-30).simplify(20)], crs=2272)
city.to_crs(4326).to_file(OUT / "city.json", driver="GeoJSON", COORDINATE_PRECISION=5)   # mask around the photo layer
for g, key, name in ((bgs_out, "bg", "bgs.json"), (zips_out, "zip", "zips.json"), (hoods_out, "name", "hoods.json"),
                     (tracts_geo, "tract", "tracts.json")):
    g = g[[key, "geometry"]].rename(columns={key: "id"})            # outlines only; numbers are in tables.json
    g.to_crs(4326).to_file(OUT / name, driver="GeoJSON", COORDINATE_PRECISION=5)
    print(f"  {name}: {len(g)} features, {(OUT / name).stat().st_size / 1e3:.0f} KB", flush=True)

# ---------- where things are, in words: direction and distance from City Hall, neighbours (no coordinates) ----------
CITY_HALL = gpd.GeoSeries(gpd.points_from_xy([-75.16352], [39.95233]), crs=4326).to_crs(2272).iloc[0]
DIRS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]


def direction(dx, dy):
    return DIRS[int(((np.degrees(np.arctan2(dx, dy)) + 360 + 22.5) % 360) // 45)]


def place_words(g, key):
    """{id: {from_city_hall: '3.1 km southwest', neighbours: [{id, direction}]}} for a GeoDataFrame in EPSG:2272."""
    c = g.geometry.representative_point()
    out = {}
    touch = gpd.sjoin(g[[key, "geometry"]], gpd.GeoDataFrame({f"{key}_n": g[key]}, geometry=g.geometry.buffer(60), crs=2272),
                      predicate="intersects")
    cen = dict(zip(g[key], c))
    for k, pt in cen.items():
        dx, dy = pt.x - CITY_HALL.x, pt.y - CITY_HALL.y
        km = np.hypot(dx, dy) * FT / 1000
        nb = sorted(set(touch[touch[key] == k][f"{key}_n"]) - {k})
        out[str(k)] = {"from_city_hall": "at City Hall" if km < 0.6 else f"{km:.1f} km {direction(dx, dy)}",
                       "neighbours": [{"id": str(n), "direction": direction(cen[n].x - pt.x, cen[n].y - pt.y)} for n in nb]}
    return out


places = {"hoods": place_words(hoods[hoods.name.isin(hoods_out.name)], "name"), "zips": place_words(zips_out, "zip"),
          "tracts": place_words(tracts_geo, "tract")}

# named rail stations (subway / elevated and regional rail; trolley stops are street corners and stay unnamed)
import zipfile as _zf, io as _io
gz = _zf.ZipFile(RAW / "transit/gtfs_public.zip")
st_rows = []
for name in ("google_bus.zip", "google_rail.zip"):
    f = _zf.ZipFile(_io.BytesIO(gz.read(name)))
    routes = pd.read_csv(f.open("routes.txt"), dtype=str)
    routes = routes[routes.route_type.isin(["1", "2"])]
    trips = pd.read_csv(f.open("trips.txt"), usecols=["route_id", "trip_id"], dtype=str)
    trips = trips[trips.route_id.isin(routes.route_id)]
    stt = pd.read_csv(f.open("stop_times.txt"), usecols=["trip_id", "stop_id"], dtype=str)
    stt = stt[stt.trip_id.isin(trips.trip_id)].merge(trips, on="trip_id").drop_duplicates(["stop_id", "route_id"])
    stops = pd.read_csv(f.open("stops.txt"), usecols=["stop_id", "stop_name", "stop_lat", "stop_lon"], dtype={"stop_id": str})
    x = stt.merge(routes[["route_id", "route_long_name", "route_type"]], on="route_id").merge(stops, on="stop_id")
    st_rows.append(x)
st = pd.concat(st_rows)
st["line"] = st.route_long_name.str.replace(r" (All Stops|Local|Express)$", "", regex=True)
st["stop_name"] = st.stop_name.str.replace(r"\s+-\s+[A-Z]\d$", "", regex=True)       # "15th St/City Hall - B1" -> one station
st["mode"] = st.route_type.map({"1": "subway / elevated", "2": "regional rail"})
pts = gpd.GeoDataFrame(st, geometry=gpd.points_from_xy(st.stop_lon, st.stop_lat), crs=4326).to_crs(2272)
pts = pts[pts.within(zips.union_all())]
pts["hood"] = gpd.sjoin(pts[["geometry"]], hoods, predicate="within", how="left").groupby(level=0).name.first()
pts["zip"] = gpd.sjoin(pts[["geometry"]], zips, predicate="within", how="left").groupby(level=0).zip.first()
pts["cell"] = [f"{int(p.x // s)}_{int(p.y // s)}" for p in pts.geometry]
stations = {}
for (nm, mode), g in pts.groupby(["stop_name", "mode"]):
    one = g.iloc[0]
    key = f"{nm} ({'regional rail' if mode == 'regional rail' else 'subway'})"
    stations[key] = {"name": nm, "mode": mode, "lines": sorted(set(g.line)), "neighbourhood": one.hood, "zip": one.zip,
                     "cell": one.cell if one.cell in set(cells_out.id) else None}
print(f"  places: {len(places['hoods'])} neighbourhoods, {len(places['zips'])} ZIP codes; named stations {len(stations)}", flush=True)

# ---------- tables for the panel and the assistant (no geometry) ----------
rq2 = json.load(open(S7 / "rq2_summary.json"))
rq3 = json.load(open(S7 / "rq3_summary.json"))
grid = pd.read_csv(ROOT / "results/citywide/m4/round2_grid.csv")
grid = grid[(grid.tag == "m4s_s0") & (grid.part == "main")]
yearly = pd.read_csv(S7 / "rq2_yearly_new_shared_units.csv")
by = {}
for name, f, col in (("rail_distance", "rq2_rates_by_rail_distance.csv", "rail_band"),
                     ("area_type", "rq2_rates_by_area_type.csv", "area_type")):
    t = pd.read_csv(S7 / f)
    by[name] = [{"period": x.period, "group": getattr(x, col), "covered_units": int(x.covered_units),
                 "new_events": int(x.new_events), "new_per_1000_per_year": r(x.new_per_1000_per_year),
                 "popup_events": int(x.popup_events), "popup_per_1000_per_year": r(x.popup_per_1000_per_year)}
                for x in t.itertuples()]
t = pd.read_csv(S7 / "rq2_rates_by_income.csv")
by["income"] = [{"by": x.by, "quintile": x.quintile, "block_groups": int(x.block_groups),
                 "median_value": r(x.median_value, 3), "new_per_1000_per_year": r(x.new_per_1000_per_year),
                 "popup_per_1000_per_year": r(x.popup_per_1000_per_year)} for x in t.itertuples()]
active = cp[(cp.units > 0) & (cp[["n18", "n22", "p18", "p22", "d18", "d22"]].sum(axis=1)
                              + cp[[c for c in cp.columns if c.startswith("y")]].clip(lower=0).sum(axis=1) >= 0.5)]
agent = {
    "city": {
        "rates_units_covered_in_both_periods": rq2["rates_units_covered_in_both_periods"],
        "rates_all_covered_units": rq2["rates_study_area"],
        "concentration_top10pct_cells": rq2["concentration_top10pct_cells"],
        "cells_250m_with_any": rq2["cells_250m_with_any"],
        "yearly_new_per_1000_fixed_units": {"units": int(yearly.units.iloc[0]),
                                            "years": [{"year": int(x.year), "rate": r(x.per_1000_per_year),
                                                       "source": x.source} for x in yearly.itertuples()]},
        "permits": rq3,
        "permit_time_to_detection": pd.read_csv(S7 / "rq3_time_to_detection.csv").round(3).to_dict("records"),
        "floor_area_and_homes": pd.read_csv(S7 / "rq3_floor_area_housing.csv").round(3).to_dict("records"),
        "sealed_test_2022_2025": [{"scale": x.scale, "class": x["class"], "cells": int(x.cells),
                                   "lidar_total": int(x.lidar_total), "model_estimate": r(x.estimate_total, 0),
                                   "r": r(x.r_calibrated)} for _, x in grid.iterrows()],
    },
    "by": by,
    "zips": table(zp, "zip"),
    "hoods": table(hp.assign(zips=hp.name.map(cells_out.groupby("hood").zip.agg(lambda z: sorted(set(z.dropna()))))), "name"),
    "bgs": table(bp, "bg"),
    "tracts": table(tp, "tract"),
    "cells": table(active, "id"),
    "places": places,
    "stations": stations,
}
dump(agent, "tables.json")
print(f"  agent cells {len(active)} of {len(cp)}", flush=True)
