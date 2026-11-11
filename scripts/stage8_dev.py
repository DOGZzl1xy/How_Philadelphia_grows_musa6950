"""Stage 8, development: street-view verdicts in ZIP 19146 against its LiDAR labels (results/citywide/stage8_plan.md).

Unit level (LiDAR labels 2018->2022 from the feasibility stage): how many LiDAR pop-ups are candidates, observable and
seen taller, by tier; what the verdicts are on candidates that LiDAR does not call a pop-up. Cell level (250 m cells
with at least 95% of their units in 19146): street-view estimate, weighted by LiDAR coverage, against the LiDAR
pop-ups of both periods.

Prints tables; writes results/citywide/stage8/dev_{tag}.json (totals only, no unit ids).
Run: uv run python scripts/stage8_dev.py --tag v1
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data/interim/stage8"
Z = "19146"
P1, P2 = (2018 + 3.5 / 12, 2022 + 3 / 12), (2022 + 3 / 12, 2025 + 3.6 / 12)   # LiDAR flights: 2018-04-15, 2022-03-30, 2025-04-18


def dec(ym):
    return int(ym[:4]) + (int(ym[5:7]) - 0.5) / 12


def shares(r):
    """Share of the change interval inside each LiDAR period; (nan, nan) if there is no usable interval."""
    if r.verdict != "taller" or pd.isna(r.first_after):
        return np.nan, np.nan
    b = int(r.first_after)
    a = int(r.last_before) if not pd.isna(r.last_before) else b - 1
    if not (1 <= a < b <= len(r.dates)):
        return np.nan, np.nan
    t0, t1 = dec(r.dates[a - 1]), dec(r.dates[b - 1])
    if t1 <= t0:
        return np.nan, np.nan
    ov = lambda p: max(0.0, min(t1, p[1]) - max(t0, p[0])) / (t1 - t0)
    return ov(P1), ov(P2)


def load(tag):
    cand = pd.read_parquet(D / "candidates.parquet")
    cand = cand[cand.zip == Z]
    ph = pd.DataFrame([json.loads(line) for line in (D / "photos" / f"{Z}.jsonl").open()])[["unit", "status", "dates"]]
    ph = ph.rename(columns={"dates": "all_dates"})
    j = pd.DataFrame([json.loads(line) for line in (D / "judge" / f"{Z}_{tag}.jsonl").open()])
    j = j[["unit", "dates", "verdict", "last_before", "first_after", "usd"]]
    f = pd.read_parquet(ROOT / "results/popup_feasibility/flagged_parcels.parquet")[
        ["unit", "chg_popup", "chg_new", "chg_demo", "chg_rear", "frac_up", "dh_p50"]]
    a = cand.merge(ph, on="unit", how="left").merge(j, on="unit", how="left").merge(f, on="unit", how="left")
    a["status"] = a.status.fillna("not_downloaded")
    s = a.apply(shares, axis=1, result_type="expand")
    a["s1"], a["s2"] = s[0], s[1]
    a["valid"] = a.s1.notna()
    return a, f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="v1")
    a_ = ap.parse_args()
    a, f = load(a_.tag)
    res = {"tag": a_.tag}
    units = pd.read_parquet(ROOT / f"data/interim/citywide_units/{Z}.parquet", columns=["unit", "in_mask"])
    cells_all = pd.read_csv(ROOT / "results/citywide/stage6/cells_250m.csv")

    print(f"candidates {len(a)}: status {a.status.value_counts().to_dict()}")
    j = a[a.verdict.notna()]
    print(f"judged {len(j)}; cost ${j.usd.sum():.2f}; verdicts {j.verdict.value_counts().to_dict()}")
    res["judged"], res["cost_usd"] = int(len(j)), float(j.usd.sum())

    # ---- LiDAR pop-ups 2018->2022: the funnel
    pop = f[f.chg_popup].merge(units[units.in_mask], on="unit")[["unit", "dh_p50"]]
    pop = pop.merge(a[["unit", "tier", "model", "upward", "zdev", "status", "verdict", "s1", "s2"]], on="unit", how="left")
    n = len(pop)
    rows = []
    for name, m in (("tier 1", pop.tier == 1), ("tier 1 + 2", pop.tier.isin([1, 2]))):
        g = pop[m]
        rows.append({"candidates": name, "LiDAR pop-ups": n, "are candidates": len(g),
                     "observable": int((g.status == "ok").sum()), "judged": int(g.verdict.notna().sum()),
                     "seen taller": int((g.verdict == "taller").sum()),
                     "taller, interval touches 2018-22": int((g.s1 > 0).sum()),
                     "credited to 2018-22": round(float(g.s1.sum()), 1)})
    t = pd.DataFrame(rows).set_index("candidates")
    print("\nLiDAR pop-ups 2018->2022 in 19146:\n" + t.T.to_string())
    res["funnel"] = t.reset_index().to_dict("records")
    g = pop[pop.verdict.notna()]
    print("verdicts on judged LiDAR pop-ups:", g.verdict.value_counts().to_dict(),
          "| strong rise (>=2.5 m):", g[g.dh_p50 >= 2.5].verdict.value_counts().to_dict())
    found1 = (pop[pop.tier == 1].s1 > 0).sum() / n
    found12 = (pop.s1 > 0).sum() / n
    print(f"share of LiDAR pop-ups found: tier 1 {found1:.1%}; tier 1 + 2 {found12:.1%}; gain {100 * (found12 - found1):.1f} points "
          f"(tier 2 is adopted from 15 points, with the author's cost approval)")
    res.update(found_tier1=float(found1), found_tier12=float(found12))

    # ---- candidates by LiDAR label
    j = j.assign(lidar=np.where(j.chg_popup.fillna(False), "pop-up", np.where(j.chg_new.fillna(False), "new", "no pop-up")))
    print("\nverdict by LiDAR label 2018->2022 (judged candidates):")
    print(pd.crosstab([j.tier, j.lidar], j.verdict, margins=True).to_string())
    tl = j[(j.verdict == "taller") & j.valid]
    print("\n'taller' with a usable interval:", len(tl), "of", int((j.verdict == "taller").sum()))
    for tier in (1, 2):
        x = tl[tl.tier == tier]
        if len(x):
            print(f" tier {tier}: n {len(x)}; credited to 2018-22 {x.s1.sum():.1f} (on LiDAR pop-ups {x[x.lidar == 'pop-up'].s1.sum():.1f}), "
                  f"to 2022-25 {x.s2.sum():.1f}, outside both {len(x) - x.s1.sum() - x.s2.sum():.1f}")
    # period-1 precision: credit that falls on LiDAR pop-ups
    for name, x in (("tier 1", tl[tl.tier == 1]), ("tier 1 + 2", tl)):
        if x.s1.sum() > 0:
            print(f" {name}: of the credit given to 2018-22, {x[x.lidar == 'pop-up'].s1.sum() / x.s1.sum():.0%} is on LiDAR pop-ups, "
                  f"{x[x.lidar == 'new'].s1.sum() / x.s1.sum():.0%} on LiDAR new construction")

    # ---- cells
    cu = pd.read_parquet(D / "candidates.parquet")
    allu = None
    import geopandas as gpd  # only here: unit -> cell for every unit of the ZIP
    u = gpd.read_parquet(ROOT / f"data/interim/citywide_units/{Z}.parquet")[["unit", "geometry", "in_mask"]]
    u = u[u.in_mask]
    c, s = u.geometry.centroid, 250 / 0.3048006096
    u["cell"] = [f"{int(x // s)}_{int(y // s)}" for x, y in zip(c.x, c.y)]
    n_here = u.groupby("cell").size()
    cells = cells_all[~cells_all.high_rise].set_index("cell")
    cells = cells[cells.index.isin(n_here.index)]
    cells = cells[(n_here.reindex(cells.index) / cells.units) >= 0.95]
    cells = cells.assign(lidar=cells.lidar_popup_2018_2022 + cells.lidar_popup_2022_2025)
    print(f"\ncells with >= 95% of their units in 19146: {len(cells)}; LiDAR pop-ups {int(cells.lidar_popup_2018_2022.sum())} + "
          f"{int(cells.lidar_popup_2022_2025.sum())}; LiDAR coverage 2018 {np.average(cells.lidar_cov_2018_2022, weights=cells.units):.2f}")
    out = {}
    for name, x in (("tier 1", tl[tl.tier == 1]), ("tier 1 + 2", tl)):
        g = x.groupby("cell")[["s1", "s2"]].sum().reindex(cells.index).fillna(0)
        est = cells.lidar_cov_2018_2022 * g.s1 + cells.lidar_cov_2022_2025 * g.s2
        r = float(np.corrcoef(est, cells.lidar)[0, 1]) if est.std() > 0 else float("nan")
        r1 = float(np.corrcoef(cells.lidar_cov_2018_2022 * g.s1, cells.lidar_popup_2018_2022)[0, 1]) if g.s1.std() > 0 else float("nan")
        k = float(cells.lidar.sum() / est.sum()) if est.sum() > 0 else float("nan")
        print(f" {name}: r = {r:.3f} (2018-22 only: {r1:.3f}); estimate {est.sum():.1f} vs LiDAR {int(cells.lidar.sum())}; calibration factor {k:.2f}")
        out[name] = {"r_250m": r, "r_250m_period1": r1, "estimate": float(est.sum()), "lidar": int(cells.lidar.sum()), "calibration": k}
    res["cells"] = {"n": int(len(cells)), **out}
    (ROOT / "results/citywide/stage8").mkdir(parents=True, exist_ok=True)
    (ROOT / f"results/citywide/stage8/dev_{a_.tag}.json").write_text(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
