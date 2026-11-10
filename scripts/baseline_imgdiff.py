"""Image-differencing baseline on the M4 VALIDATION set (2018 -> 2022, validation 1 km blocks). Not the sealed test.

    POPUP_DATA=citywide uv run python scripts/baseline_imgdiff.py   -> results/citywide/m4/baseline_imgdiff.json

Same photos, same building units and same LiDAR labels as the final model's validation (m4s_s0_valbest_2018_2022):
1. both photos registered to LiDAR with the same global shift as the model, averaged to 0.5 m;
2. the later photo matched to the earlier one per channel (mean and standard deviation over the patch), so a
   brighter or darker flight is not counted as change;
3. per pixel, the colour distance between the two photos;
4. per building unit (units >= 90% inside the patch, averaged over patches), three scores: mean distance,
   90th percentile of distance, share of pixels whose distance exceeds the 95th percentile of all pixels.
Reported: average precision and best-F1 precision / recall for "grew" and for new construction (grew, not pop-up),
next to the final model on the same units.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
import bitemporal as B  # noqa: E402
import height_data as H  # noqa: E402
import height_model as M  # noqa: E402
import unitcls as U  # noqa: E402

assert H.CITY, "set POPUP_DATA=citywide"
OUT = ROOT / "results/citywide/m4/baseline_imgdiff.json"
shift = torch.load(ROOT / "data/interim/models/unitcls_m4s_s0.pt", map_location="cpu", weights_only=False)["shift"]
val = pd.read_parquet(ROOT / "data/interim/unitcls_preds/m4s_s0_valbest_2018_2022.parquet")
val["zip"] = val.zip.astype(str)
sp = pd.read_csv(ROOT / "data/interim/m4_patches.csv", dtype={"zip": str})
sp = sp[sp.split == "val"][["zip", "i", "j"]].drop_duplicates()
zips = sorted(sp.zip.unique())


def half(img):
    """(3, 1024, 1024) uint8 -> (3, 512, 512) float32 at 0.5 m, the unit-id grid."""
    x = img.astype(np.float32)
    return x.reshape(3, 512, 2, 512, 2).mean((2, 4))


acc = {}   # (zip, unit) -> list of (mean, p90, share) over patches
pix = []   # sample of distances for the global 95th-percentile threshold
patches = []
for z in zips:
    pi = B.pair_index((z,), 2018, 2022).merge(sp[sp.zip == z], on=["zip", "i", "j"])
    sizes = U.unit_id_patches(z, 2018)
    for r in pi.itertuples():
        a0, b0 = B.load_patch(r.path0, filled=False), B.load_patch(r.path1, filled=False)
        x0, x1 = half(M.shift_image(a0["img"], *shift)), half(M.shift_image(b0["img"], *shift))
        m0, s0 = x0.mean((1, 2), keepdims=True), x0.std((1, 2), keepdims=True) + 1e-6
        m1, s1 = x1.mean((1, 2), keepdims=True), x1.std((1, 2), keepdims=True) + 1e-6
        x1 = (x1 - m1) / s1 * s0 + m0
        d = np.sqrt(((x1 - x0) ** 2).sum(0))
        ud = np.load(U.UID_DIR / f"{z}_{r.i}_{r.j}.npy").astype(np.int32)
        patches.append((z, d.astype(np.float16), ud, sizes))
        pix.append(d[::8, ::8].ravel())
thr = float(np.quantile(np.concatenate(pix), 0.95))

for z, d, ud, sizes in patches:
    flat_u, flat_d = ud.ravel(), d.ravel()
    for u in np.unique(flat_u[flat_u > 0]):
        sel = flat_d[flat_u == u]
        uid = int(u) - 1
        tot = sizes.get(uid, 0)
        if tot == 0 or len(sel) < U.MIN_IN_CROP * tot:
            continue
        acc.setdefault((z, uid), []).append((sel.mean(), np.quantile(sel, 0.9), (sel > thr).mean()))

base = pd.DataFrame([{"zip": z, "unit": u, "mean": np.mean([v[0] for v in vs]), "p90": np.mean([v[1] for v in vs]),
                      "share": np.mean([v[2] for v in vs])} for (z, u), vs in acc.items()])
df = val.merge(base, on=["zip", "unit"], how="inner")
df["new"] = ((df.grew == 1) & (df.popup == 0)).astype(int)


def ap(y, s):
    o = np.argsort(-s)
    y = np.asarray(y)[o]
    return float((np.cumsum(y) / np.arange(1, len(y) + 1) * y).sum() / max(y.sum(), 1))


def best_f1(y, s):
    best = (0, 0, 0)
    for t in np.unique(np.quantile(s, np.linspace(0.5, 0.9995, 400))):
        p = s >= t
        tp = (p & (y == 1)).sum()
        f1 = 2 * tp / max(p.sum() + y.sum(), 1)
        if f1 > best[0]:
            best = (float(f1), float(tp / max(p.sum(), 1)), float(tp / max(y.sum(), 1)))
    return {"f1": round(best[0], 3), "precision": round(best[1], 3), "recall": round(best[2], 3)}


m4_thr = json.load(open(ROOT / "results/citywide/m4/unitcls_m4s_s0_val.json"))["thresholds"]
m4_new = ((df.logit_grew >= m4_thr["grew"]) & (df.logit_popup < m4_thr["popup"])).to_numpy()
out = {"units": int(len(df)), "units_in_model_validation": int(len(val)), "grew": int(df.grew.sum()),
       "new": int(df.new.sum()), "pixel_threshold_p95": round(thr, 2), "baseline": {}, "final_model": {}}
for k in ("mean", "p90", "share"):
    s = df[k].to_numpy()
    out["baseline"][k] = {"grew_ap": round(ap(df.grew.to_numpy(), s), 3), "grew_best_f1": best_f1(df.grew.to_numpy(), s),
                          "new_ap": round(ap(df.new.to_numpy(), s), 3), "new_best_f1": best_f1(df.new.to_numpy(), s)}
tp = int((m4_new & (df.new == 1)).sum())
out["final_model"] = {"grew_ap": round(ap(df.grew.to_numpy(), df.logit_grew.to_numpy()), 3),
                      "grew_best_f1": best_f1(df.grew.to_numpy(), df.logit_grew.to_numpy()),
                      "new_flags_at_validation_thresholds": {"precision": round(tp / max(m4_new.sum(), 1), 3),
                                                             "recall": round(tp / max(df.new.sum(), 1), 3)}}
OUT.write_text(json.dumps(out, indent=1))
print(json.dumps(out, indent=1))
