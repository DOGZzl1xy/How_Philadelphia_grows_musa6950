"""Base public layers (no keys); stage-7 layers are in scripts/stage7_data.py. Sources written next to the files.

    python scripts/fetch_base.py [parcels] [footprints] [zoning] [zips] [bg2019]     # default: all

parcels     PWD parcels 2016 and 2025 (PASDA)            -> data/raw/parcels/PhillyWater_PWD_PARCELS{,2025}/
footprints  building footprints 2017 (PASDA)             -> data/raw/footprints/PhiladelphiaBuildings2017/
zoning      current zoning base districts (ArcGIS)       -> data/raw/zoning/zoning_basedistricts.gpkg
zips        ZIP code polygons (ArcGIS Zipcodes_Poly)     -> data/raw/boundaries/zip_codes.geojson
bg2019      2019 TIGER block groups, Pennsylvania        -> data/raw/boundaries/tl_2019_42_bg.zip
"""

import io
import sys
import time
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
PASDA = "https://www.pasda.psu.edu/download/philacity/data"
AGOL = "https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services"
STAMP = f"downloaded {pd.Timestamp.now():%Y-%m-%d}"


def get(url, **kw):
    for attempt in range(4):
        try:
            r = requests.get(url, timeout=900, **kw)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            print(f"  retry {attempt + 1}: {e}", flush=True)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(url)


def pasda_zip(name, sub):
    out = RAW / sub / name
    if out.exists():
        return
    url = f"{PASDA}/{name}.zip"
    zipfile.ZipFile(io.BytesIO(get(url).content)).extractall(out)
    (RAW / sub / f"SOURCE_{name}.txt").write_text(f"{url}; {STAMP}\n")
    print(f"  {name}: {sum(f.stat().st_size for f in out.rglob('*')) / 1e6:.0f} MB", flush=True)


def flatten(out):
    """Move shapefile parts up when the archive wraps them in a folder of its own."""
    for f in list(out.rglob("*")):
        if f.is_file() and f.parent != out:
            f.replace(out / f.name)


def agol(service, path, keep_crs=4326):
    url = f"{AGOL}/{service}/FeatureServer/0/query"
    parts, off = [], 0
    while True:
        r = get(url, params={"where": "1=1", "outFields": "*", "f": "geojson", "resultOffset": off,
                             "resultRecordCount": 2000, "outSR": keep_crs})
        j = r.json()
        g = gpd.GeoDataFrame.from_features(j["features"], crs=keep_crs)
        parts.append(g)
        off += len(g)
        if g.empty or not j.get("properties", {}).get("exceededTransferLimit"):
            break
    g = pd.concat(parts, ignore_index=True)
    g.columns = [c.lower() if c != "geometry" else c for c in g.columns]
    g = gpd.GeoDataFrame(g, geometry="geometry", crs=keep_crs)
    path.parent.mkdir(parents=True, exist_ok=True)
    g.to_file(path, driver="GPKG" if path.suffix == ".gpkg" else "GeoJSON")
    (path.parent / f"SOURCE_{path.stem}.txt").write_text(f"{url} (all features, paged); {STAMP}\n")
    print(f"  {path.name}: {len(g):,} features", flush=True)


def main(which):
    if "parcels" in which:
        for n in ("PhillyWater_PWD_PARCELS", "PhillyWater_PWD_PARCELS2025"):
            pasda_zip(n, "parcels")
            flatten(RAW / "parcels" / n)
    if "footprints" in which:
        pasda_zip("PhiladelphiaBuildings2017", "footprints")
        flatten(RAW / "footprints/PhiladelphiaBuildings2017")
    if "zoning" in which:
        agol("Zoning_BaseDistricts", RAW / "zoning/zoning_basedistricts.gpkg")
    if "zips" in which:
        agol("Zipcodes_Poly", RAW / "boundaries/zip_codes.geojson")
    if "bg2019" in which:
        f = RAW / "boundaries/tl_2019_42_bg.zip"
        if not f.exists():
            url = "https://www2.census.gov/geo/tiger/TIGER2019/BG/tl_2019_42_bg.zip"
            f.write_bytes(get(url).content)
            (RAW / "boundaries/SOURCE_tl_2019_42_bg.txt").write_text(f"{url}; {STAMP}\n")


if __name__ == "__main__":
    main(set(sys.argv[1:]) or {"parcels", "footprints", "zoning", "zips", "bg2019"})
