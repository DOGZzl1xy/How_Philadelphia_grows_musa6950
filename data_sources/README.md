# Data sources

Data lives outside the repository (`~/data/musa6950-final/` on WSL); `data` at the repository root is a symlink to it and is
not committed. This folder keeps the source records of the downloads the committed results were computed from.

| Layer | Path under `data/` | Source | Download used by the results |
|---|---|---|---|
| PWD parcels 2016, 2025 | `raw/parcels/` | PASDA `philacity/data/PhillyWater_PWD_PARCELS{,2025}.zip` | Oct 2026 |
| Building footprints 2017 | `raw/footprints/` | PASDA `philacity/data/PhiladelphiaBuildings2017.zip` | Oct 2026 |
| Zoning base districts (current) | `raw/zoning/` | ArcGIS `Zoning_BaseDistricts` | Oct 2026 |
| ZIP codes | `raw/boundaries/zip_codes.geojson` | ArcGIS `Zipcodes_Poly` | Oct 2026 |
| Block groups 2019, 2020 | `raw/boundaries/` | Census TIGER | Oct 2026 |
| L&I permits 2014-2025 | `raw/li/` | Carto `permits`, see `li_permits_studyarea.txt` | 2026-10-27 |
| ACS 5-year 2019, 2023 | `raw/acs/` | Census summary files, see `acs.txt` | 2026-10-27; Explore tables 2026-11-07 |
| SEPTA GTFS | `raw/transit/` | see `transit.txt` | 2026-10-27 |
| LiDAR 2010-2025 | `interim/citywide_tiles/`, `interim/citywide_rasters/` | PASDA `phillyLiDAR` (src/tiles.py), streamed | Oct 2026 |
| Aerial imagery, 9 years | `raw/ortho/tiles/` | City ArcGIS tile services (src/ortho_chips.py) | Oct 2026 |

On 2026-11-07 `data/` was deleted by accident. The public layers above were downloaded again the same day
(`scripts/fetch_base.py`, `scripts/stage7_data.py`); zoning had changed slightly (about 0.03 km2 of kept area) and the
rebuilt study area has 526,887 units against 526,928 originally. LiDAR, imagery, LiDAR change labels and
`interim/stage6_units.parquet` were not rebuilt, so stages 6-7 cannot be re-run without them; their outputs are in
`results/`. M4 checkpoints are backed up off-site.

Explore page (2026-11-07): neighbourhood outlines `raw/boundaries/philadelphia-neighborhoods.geojson` from
OpenDataPhilly open-geo-data (GitHub), names only; used to name areas on the map and for the assistant.
