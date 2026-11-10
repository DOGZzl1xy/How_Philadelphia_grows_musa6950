"""Two descriptive checks added for the final report (2026-11-05). Nothing here is used to choose or tune anything.

    POPUP_DATA=citywide uv run python scripts/report_checks.py   -> results/citywide/report_checks.json

1. New construction at the unit level on the sealed test: precision / recall of the derived flag
   (grew flag and not pop-up flag), from the saved round-2 predictions. The model is not run again and the
   round-2 lock is not touched. There is no unit AP for new construction: it is a rule on two thresholded heads,
   not a score.
2. Yearly new construction on ONE fixed unit set: units in both anchor sets (2018 and 2022) and covered by
   LiDAR in both periods, so the 2019-2025 series is not affected by the change of denominator.
"""

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
sys.path.append(str(ROOT / "scripts"))

out = {}

# 1. unit-level new construction on the sealed test (same unit set as round2_test.json "units_main")
import m4_test as T  # noqa: E402  helpers only

df = pd.read_parquet(ROOT / "data/interim/unitcls_preds/m4s_s0_ROUND2_2022_2025.parquet")
thr = {"grew": float(df.thr_grew.iloc[0]), "popup": float(df.thr_popup.iloc[0])}
d = T.geography(T.model_flags(T.with_truth(df, "lidar_change_city", 2022, 2025), thr))
hr = pd.read_csv(ROOT / "results/citywide/highrise_all.csv")
d = d[~d.c100.isin(set(hr[(hr.unit == "c100") & hr.flagged].key))]
m, t = d["m_new"].astype(bool), d["t_new"].astype(bool)
out["test_new_construction_units"] = {
    "units": int(len(d)), "lidar": int(t.sum()), "model_flags": int(m.sum()), "true_pos": int((m & t).sum()),
    "precision": float((m & t).sum() / m.sum()), "recall": float((m & t).sum() / t.sum()),
    "grew_flags": int(d["m_grew"].sum()), "popup_flags": int(d["m_popup"].sum()),
    "popup_flags_outside_grew": int((d["m_popup"].astype(bool) & ~d["m_grew"].astype(bool)).sum()),
}

# 2. yearly series on one fixed unit set
from stage7_rq2 import yearly_new  # noqa: E402

base = pd.read_parquet(ROOT / "data/interim/stage6_units.parquet")
base = base[~base.hr_c250]
fac = json.load(open(ROOT / "results/citywide/m4/round2_test.json"))["models"]["m4s_s0"][
    "calibration_from_validation"]["new"]["factor"]
shared = base[base.cov2018_2022 & base.sc2018_2019 & base.sc2018_2020
              & base.cov2022_2025 & base.sc2022_2023 & base.sc2022_2024]
yr = yearly_new(shared, fac)
yr.to_csv(ROOT / "results/citywide/stage7/rq2_yearly_new_shared_units.csv", index=False)
out["yearly_new_shared_units"] = {"units": int(len(shared)),
                                  "per_1000_per_year": {f"{r.anchor}:{r.year}": round(float(r.per_1000_per_year), 3)
                                                        for r in yr.itertuples()}}
(ROOT / "results/citywide/report_checks.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
print(json.dumps(out, indent=1))
