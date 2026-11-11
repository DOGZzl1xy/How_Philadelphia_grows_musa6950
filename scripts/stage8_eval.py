"""Stage 8: street-view pop-up estimates per 250 m cell against LiDAR (results/citywide/stage8_plan.md).

For an area (dev = ZIP 19146, sealed = the 8 test ZIP codes, other = the rest): every unit judged "taller" is split
between the two LiDAR periods by the share of its change interval in each, weighted by the LiDAR coverage of its cell,
and summed per cell; the sum is compared with the LiDAR pop-ups of both periods. Three estimates are computed:
observed only (candidates without photographs count 0), imputed (they get the mean credit of the observed candidates of
the same source in the area), and a baseline that uses no single photograph (every candidate gets that mean); the
primary one is compared with the baseline by a paired bootstrap. Cells need at least 95% of their units
inside the area. Reports r with a 95% bootstrap interval over cells, the count ratio, r on cells with at least 90%
LiDAR coverage in 2018, r per block group, and the observable share.

The sealed area needs results/citywide/stage8/FROZEN (json: name, tiers, primary, calibration) and runs once: it writes
results/citywide/stage8/sealed_eval_log.csv and refuses to run when that file exists.

Output: results/citywide/stage8/eval_{area}.json and cells_{area}.csv (cell, units, estimate, lidar; no unit ids).
Run: uv run python scripts/stage8_eval.py --area dev --name v1ob --tiers 1,2
"""
import argparse
import json
import sys
import zipfile
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data/interim/stage8"
RES = ROOT / "results/citywide/stage8"
FROZEN, LOCK = RES / "FROZEN", RES / "sealed_eval_log.csv"
FT = 0.3048006096
P1, P2 = (2018 + 3.5 / 12, 2022 + 3 / 12), (2022 + 3 / 12, 2025 + 3.6 / 12)   # flights 2018-04-15, 2022-03-30, 2025-04-18


def dec(ym):
    return int(ym[:4]) + (int(ym[5:7]) - 0.5) / 12


def shares(r):
    """Share of a 'taller' unit's change interval inside each LiDAR period; (nan, nan) without a usable interval."""
    if r.verdict != "taller" or pd.isna(r.first_after):
        return np.nan, np.nan
    b = int(r.first_after)
    a = int(r.last_before) if not pd.isna(r.last_before) else b - 1
    if not (1 <= a < b <= len(r.dates)):
        return np.nan, np.nan
    t0, t1 = dec(r.dates[a - 1]), dec(r.dates[b - 1])
    if t1 <= t0:
        return np.nan, np.nan
    ov = lambda p: max(0.0, min(t1, p[1]) - max(t0, p[0])) / (t1 - t0)  # noqa: E731
    return ov(P1), ov(P2)


def all_units(zips):
    """Every in-mask unit of the ZIP codes with its 250 m cell and 2019 block group."""
    rows = []
    for z in zips:
        u = gpd.read_parquet(ROOT / f"data/interim/citywide_units/{z}.parquet")[["unit", "geometry", "in_mask"]]
        u = u[u.in_mask]
        c, s = u.geometry.centroid, 250 / FT
        rows.append(gpd.GeoDataFrame({"zip": z, "unit": u.unit.to_numpy(),
                                      "cell": [f"{int(x // s)}_{int(y // s)}" for x, y in zip(c.x, c.y)]},
                                     geometry=c.to_numpy(), crs=2272))
    u = pd.concat(rows, ignore_index=True)
    f = ROOT / "data/raw/boundaries/tl_2019_42_bg.zip"
    with zipfile.ZipFile(f) as zf:
        name = next(n for n in zf.namelist() if n.endswith(".shp"))
    bg = gpd.read_file(f"zip://{f}!{name}")
    bg = bg[bg.COUNTYFP == "101"].to_crs(2272)[["GEOID", "geometry"]]
    u["bg"] = gpd.sjoin(u, bg, how="left", predicate="within").GEOID.to_numpy()
    return pd.DataFrame(u.drop(columns="geometry"))


def boot_r(x, y, n=2000, seed=6950):
    rng, k, out = np.random.default_rng(seed), len(x), []
    for _ in range(n):
        i = rng.integers(0, k, k)
        if x[i].std() > 0 and y[i].std() > 0:
            out.append(np.corrcoef(x[i], y[i])[0, 1])
    return [float(np.percentile(out, 2.5)), float(np.percentile(out, 97.5))] if out else [np.nan, np.nan]


def r_of(x, y):
    return float(np.corrcoef(x, y)[0, 1]) if len(x) > 2 and x.std() > 0 and y.std() > 0 else float("nan")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--area", required=True, choices=["dev", "sealed", "other"])
    ap.add_argument("--name", default="")
    ap.add_argument("--tiers", default="")
    ap.add_argument("--calibration", type=float, default=float("nan"))
    ap.add_argument("--primary", default="imputed", choices=["observed_only", "imputed", "baseline"])
    a = ap.parse_args()
    if a.area != "dev":
        if not FROZEN.exists():
            sys.exit("settings are not frozen (results/citywide/stage8/FROZEN)")
        fz = json.loads(FROZEN.read_text())
        a.name, a.tiers, a.calibration, a.primary = fz["name"], ",".join(map(str, fz["tiers"])), fz["calibration"], fz["primary"]
    if a.area == "sealed" and LOCK.exists():
        sys.exit("the sealed evaluation has already been run (sealed_eval_log.csv); it is not run again")
    tiers = [int(t) for t in a.tiers.split(",")]

    cand = pd.read_parquet(D / "candidates.parquet")
    cand = cand[(cand.area == a.area) & cand.tier.isin(tiers)]
    zips = sorted(pd.read_parquet(D / "candidates.parquet").query("area == @a.area").zip.unique())
    ph, jd, missing = [], [], []
    for z in zips:
        fp, fj = D / "photos" / f"{z}.jsonl", D / "judge" / f"{z}_{a.name}.jsonl"
        if not fp.exists() or not fj.exists():
            missing.append(z)
            continue
        ph.append(pd.DataFrame([json.loads(line) for line in fp.open()])[["zip", "unit", "status"]])
        jd.append(pd.DataFrame([json.loads(line) for line in fj.open()])[["zip", "unit", "dates", "verdict", "last_before", "first_after"]])
    if missing and a.area == "sealed":
        sys.exit(f"photographs or verdicts missing for {missing}")
    x = cand.merge(pd.concat(ph), on=["zip", "unit"], how="left").merge(pd.concat(jd), on=["zip", "unit"], how="left")
    todo = int(((x.status == "ok") & x.verdict.isna()).sum()) + int(x.status.isna().sum())
    if todo and a.area == "sealed":
        sys.exit(f"{todo} candidates are not downloaded or not judged yet")
    s = x.apply(shares, axis=1, result_type="expand")
    x["s1"], x["s2"] = s[0], s[1]
    tl = x[x.s1.notna()]
    # three estimates per unit: observed only (unobserved candidates count 0); imputed (an unobserved candidate gets
    # the mean credit of the observed candidates of the same source in this area); baseline (every candidate gets
    # that mean, so no single photograph is used)
    x["obs"] = x.status == "ok"
    x["src"] = np.where(x.upward, "upward", np.where(x.model_2018_2020 & x.model_2022_2024, "both pairs",
                        np.where(x.model_2018_2020, "model 2018-20", np.where(x.model_2022_2024, "model 2022-24", "zoning"))))
    o1, o2 = x.s1.fillna(0), x.s2.fillna(0)
    m = x[x.obs].assign(o1=o1, o2=o2).groupby("src")[["o1", "o2"]].mean()
    b1, b2 = x.src.map(m.o1).fillna(0), x.src.map(m.o2).fillna(0)
    x["imp1"], x["imp2"] = np.where(x.obs, o1, b1), np.where(x.obs, o2, b2)
    x["base1"], x["base2"] = b1, b2

    U = all_units([z for z in zips if z not in missing])
    cells = pd.read_csv(ROOT / "results/citywide/stage6/cells_250m.csv")
    cells = cells[~cells.high_rise].set_index("cell")
    here = U.groupby("cell").size()
    cells = cells[cells.index.isin(here.index)]
    cells = cells[(here.reindex(cells.index) / cells.units) >= 0.95].copy()
    cells["lidar"] = cells.lidar_popup_2018_2022 + cells.lidar_popup_2022_2025
    def per_cell(c1, c2):
        g = x.groupby("cell")[[c1, c2]].sum().reindex(cells.index).fillna(0)
        return cells.lidar_cov_2018_2022 * g[c1] + cells.lidar_cov_2022_2025 * g[c2]

    g = tl.groupby("cell")[["s1", "s2"]].sum().reindex(cells.index).fillna(0)
    cells["observed_only"] = cells.lidar_cov_2018_2022 * g.s1 + cells.lidar_cov_2022_2025 * g.s2
    cells["imputed"] = per_cell("imp1", "imp2")
    cells["baseline"] = per_cell("base1", "base2")
    cells["candidates"] = x.groupby("cell").size().reindex(cells.index).fillna(0)
    cells["raw"] = cells[a.primary]
    k = a.calibration if not np.isnan(a.calibration) else float(cells.lidar.sum() / cells.raw.sum())
    cells["estimate"] = k * cells.raw
    xs, ys = cells.estimate.to_numpy(), cells.lidar.to_numpy()
    hi = cells[cells.lidar_cov_2018_2022 >= 0.9]
    variants = {v: {"r_250m": r_of(cells[v].to_numpy(), ys), "ci95": boot_r(cells[v].to_numpy(), ys), "total": float(cells[v].sum())}
                for v in ("observed_only", "imputed", "baseline", "candidates")}
    rng, n_c, diff = np.random.default_rng(6950), len(cells), {"baseline": [], "candidates": []}
    pv = cells[a.primary].to_numpy()
    for _ in range(4000):                       # paired bootstrap over cells: primary minus each no-street-view baseline
        i = rng.integers(0, n_c, n_c)
        if ys[i].std() == 0 or pv[i].std() == 0:
            continue
        for b in diff:
            bv = cells[b].to_numpy()
            if bv[i].std() > 0:
                diff[b].append(np.corrcoef(pv[i], ys[i])[0, 1] - np.corrcoef(bv[i], ys[i])[0, 1])
    gain = {b: {"difference": variants[a.primary]["r_250m"] - variants[b]["r_250m"],
                "ci95": [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))] if d else [np.nan, np.nan]}
            for b, d in diff.items()}

    # block groups: LiDAR counts from the stage-6 table, street-view shares summed with the block group's coverage
    bgt = pd.read_csv(ROOT / "results/citywide/stage6/cells_bg.csv", dtype={"cell": str}).set_index("cell")
    bgt = bgt[~bgt.high_rise] if "high_rise" in bgt.columns else bgt
    nb = U.groupby("bg").size()
    bgt = bgt[bgt.index.isin(nb.index)]
    bgt = bgt[(nb.reindex(bgt.index) / bgt.units) >= 0.95].copy()
    c1, c2 = {"observed_only": ("s1", "s2"), "imputed": ("imp1", "imp2"), "baseline": ("base1", "base2")}[a.primary]
    gb = x.merge(U[["zip", "unit", "bg"]], on=["zip", "unit"]).groupby("bg")[[c1, c2]].sum().reindex(bgt.index).fillna(0)
    bg_est = k * (bgt.lidar_cov_2018_2022 * gb[c1] + bgt.lidar_cov_2022_2025 * gb[c2])
    bg_lid = bgt.lidar_popup_2018_2022 + bgt.lidar_popup_2022_2025

    res = {"area": a.area, "name": a.name, "tiers": tiers, "zips": len(zips) - len(missing), "zips_missing": missing,
           "candidates": int(len(x)), "observable": int((x.status == "ok").sum()),
           "observable_share": float((x.status == "ok").mean()), "judged": int(x.verdict.notna().sum()),
           "verdicts": x.verdict.value_counts().to_dict(), "taller_with_interval": int(len(tl)),
           "cells": int(len(cells)), "cells_with_lidar_popups": int((cells.lidar > 0).sum()),
           "lidar_popups": int(cells.lidar.sum()), "primary": a.primary, "variants": variants,
           "primary_minus_no_street_view": gain, "credit_per_observed_candidate_by_source": (m.o1 + m.o2).round(3).to_dict(),
           "estimate_raw": float(cells.raw.sum()), "calibration": k,
           "estimate": float(cells.estimate.sum()), "count_ratio": float(cells.estimate.sum() / max(cells.lidar.sum(), 1)),
           "r_250m": r_of(xs, ys), "r_250m_ci95": boot_r(xs, ys),
           "r_250m_cov90": r_of(hi.estimate.to_numpy(), hi.lidar.to_numpy()), "cells_cov90": int(len(hi)),
           "lidar_popups_cov90": int(hi.lidar.sum()),
           "r_bg": r_of(bg_est.to_numpy(), bg_lid.to_numpy()), "block_groups": int(len(bgt)),
           "gate_r_250m_0.8": bool(r_of(xs, ys) >= 0.8),
           "street_view_beats_baseline": bool(gain["baseline"]["ci95"][0] > 0)}
    RES.mkdir(parents=True, exist_ok=True)
    tag = a.area if a.area != "dev" else f"dev_{a.name}_t{''.join(map(str, tiers))}"
    (RES / f"eval_{tag}.json").write_text(json.dumps(res, indent=1))
    cells.reset_index()[["cell", "units", "lidar_cov_2018_2022", "lidar_cov_2022_2025", "candidates", "baseline",
                         "observed_only", "imputed", "estimate", "lidar"]].round(3).to_csv(
        RES / f"cells_{tag}.csv", index=False)
    if a.area == "sealed":
        LOCK.write_text(f"run,name,tiers,calibration,r_250m\n{pd.Timestamp.now():%Y-%m-%d %H:%M},{a.name},{a.tiers},{k:.4f},{res['r_250m']:.4f}\n")
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
