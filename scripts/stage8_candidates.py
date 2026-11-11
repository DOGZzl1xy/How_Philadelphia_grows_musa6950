"""Stage 8, step 1: candidate units for the street-view check (results/citywide/stage8_plan.md).

Tier 1: model pop-up score above the fixed stage-6 threshold in the 2018->2020 or the 2022->2024 pair, or an
upward-addition permit issued 2015-04-01 to 2025-04-30. Tier 2: a zoning permit for an addition or new development in
the same dates (used only if development in ZIP 19146 says so). Units in high-rise 250 m cells are left out.

Amendment 2 adds `hot`: the unit lies in a 250 m cell where the aerial model flags at least 3 buildings as grown
(results/citywide/stage8/hot_cells.csv).

Output: data/interim/stage8/candidates.parquet (zip, unit, cell, area role, model, upward, zdev, tier, hot); a count table
is printed. Run: uv run python scripts/stage8_candidates.py
"""
import glob
import json
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import permits as P  # noqa: E402

OUT = ROOT / "data/interim/stage8"
FT = 0.3048006096
DEV_ZIP = "19146"
PERMIT_FROM, PERMIT_TO = "2015-04-01", "2025-05-01"
HOT_MIN = 3


def units():
    rows = []
    for f in sorted(glob.glob(str(ROOT / "data/interim/citywide_units/*.parquet"))):
        u = gpd.read_parquet(f)[["unit", "opas", "geometry", "in_mask"]]
        u = u[u.in_mask]
        c, s = u.geometry.centroid, 250 / FT
        rows.append(pd.DataFrame({"zip": Path(f).stem, "unit": u.unit.to_numpy(), "opas": u.opas.to_numpy(),
                                  "cell": [f"{int(x // s)}_{int(y // s)}" for x, y in zip(c.x, c.y)]}))
    return pd.concat(rows, ignore_index=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    U = units()
    zt = pd.read_csv(ROOT / "results/citywide/splits_citywide_zips.csv", dtype={"zip": str})
    test = set(zt[zt.test].zip)
    U["area"] = U.zip.map(lambda z: "sealed" if z in test else ("dev" if z == DEV_ZIP else "other"))
    cells = pd.read_csv(ROOT / "results/citywide/stage6/cells_250m.csv")
    U = U[~U.cell.isin(set(cells[cells.high_rise].cell))]

    thr = json.load(open(ROOT / "results/citywide/stage6/meta.json"))["thresholds"]["popup"]
    mod = []
    for pair in ("2018_2020", "2022_2024"):
        s = pd.concat([pd.read_parquet(f) for f in glob.glob(str(ROOT / f"data/interim/stage6_scores/*_{pair}.parquet"))])
        mod.append(s[s.logit_popup > thr][["zip", "unit"]].assign(**{f"model_{pair}": True}))
    p = pd.read_csv(ROOT / "data/raw/li/permits_studyarea_2014_2025.csv", low_memory=False,
                    dtype={"opa_account_num": str, "parcel_id_num": str, "zip": str})
    p["permitissuedate"] = pd.to_datetime(p.permitissuedate, errors="coerce", utc=True).dt.tz_convert(None)
    p["opa"] = p.opa_account_num.str.replace(r"\.0$", "", regex=True).str.zfill(9).where(p.opa_account_num.notna())
    p = P.classify(p).drop(columns="zip")
    p = p[(p.permitissuedate >= PERMIT_FROM) & (p.permitissuedate < PERMIT_TO)].dropna(subset=["opa"])
    ex = U[["zip", "unit", "opas"]].explode("opas").dropna(subset=["opas"])
    ex["opa"] = ex.opas.astype(str).str.zfill(9)

    def with_permit(flag, name):
        return p[p[flag]].merge(ex[["opa", "zip", "unit"]], on="opa")[["zip", "unit"]].drop_duplicates().assign(**{name: True})

    A = U.drop(columns="opas")
    for t in mod + [with_permit("is_upward", "upward"), with_permit("is_zoning_dev", "zdev")]:
        A = A.merge(t, on=["zip", "unit"], how="left")
    for k in ("model_2018_2020", "model_2022_2024", "upward", "zdev"):
        A[k] = A[k].fillna(False).astype(bool)
    A["model"] = A.model_2018_2020 | A.model_2022_2024
    A["tier"] = 0
    A.loc[A.zdev, "tier"] = 2
    A.loc[A.model | A.upward, "tier"] = 1
    A = A[A.tier > 0].reset_index(drop=True)
    # amendment 2: hot cells = the aerial model flags at least HOT_MIN buildings as grown over its two long pairs
    cells["flagged"] = cells.model_flags_grew_2018_2020 + cells.model_flags_grew_2022_2024
    hot = cells[~cells.high_rise & (cells.flagged >= HOT_MIN)][["cell", "units", "flagged"]]
    (ROOT / "results/citywide/stage8").mkdir(parents=True, exist_ok=True)
    hot.to_csv(ROOT / "results/citywide/stage8/hot_cells.csv", index=False)
    A["hot"] = A.cell.isin(set(hot.cell))
    A.to_parquet(OUT / "candidates.parquet")
    print(f"hot cells (at least {HOT_MIN} buildings flagged as grown): {len(hot)}; candidates inside: "
          f"{A[A.hot].groupby('tier').size().to_dict()}")
    t = A.groupby(["area", "tier"]).size().unstack(fill_value=0)
    t.loc["all"] = t.sum()
    print(f"model threshold {thr:.4f}; permits {PERMIT_FROM} to {PERMIT_TO}")
    print(t.to_string())
    print("tier 1 by source:", {"model": int((A.model & (A.tier == 1)).sum()), "upward": int(A.upward.sum()),
                                "both": int((A.model & A.upward).sum())})


if __name__ == "__main__":
    main()
