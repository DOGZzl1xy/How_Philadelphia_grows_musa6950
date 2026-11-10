"""Bootstrap interval for the sealed-test correlation of new construction at 250 m (added 2026-11-09 for the report).

    uv run python scripts/report_ci.py   -> adds "test_new_r_250m_bootstrap" to results/citywide/report_checks.json

Descriptive only: the model is not run again and the round-2 lock is not touched. Input is the per-cell table
exported from the saved round-2 predictions for the website (web/public/data/results/test_cells.json: calibrated
model count and LiDAR count of new construction per 250 m cell, units in high-rise 100 m cells left out, 600 cells;
the test table's 594 cells leave out high-rise 250 m cells instead; r is 0.96 on both). Cells are resampled with
replacement 10,000 times (seed 0); the interval is the 2.5th to 97.5th percentile of Pearson r.
"""

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
cells = json.load(open(ROOT / "web/public/data/results/test_cells.json"))["cells"]
x = np.array([c["lidar"] for c in cells], float)
y = np.array([c["model"] for c in cells], float)
rng = np.random.default_rng(0)
rs = []
for _ in range(10000):
    i = rng.integers(0, len(x), len(x))
    if x[i].std() > 0 and y[i].std() > 0:
        rs.append(np.corrcoef(x[i], y[i])[0, 1])
lo, hi = np.percentile(rs, [2.5, 97.5])
res = {"cells": len(x), "r": round(float(np.corrcoef(x, y)[0, 1]), 3), "ci95": [round(float(lo), 3), round(float(hi), 3)],
       "draws": len(rs), "method": "percentile bootstrap over 250 m cells, seed 0"}
p = ROOT / "results/citywide/report_checks.json"
out = json.loads(p.read_text(encoding="utf-8"))
out["test_new_r_250m_bootstrap"] = res
p.write_text(json.dumps(out, indent=1), encoding="utf-8")
print(json.dumps(res, indent=1))
