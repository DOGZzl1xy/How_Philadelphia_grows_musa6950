"""Model-section assets for the website (-> web/public/data/model/, git-ignored).

    uv run python web/pipeline/export_model_assets.py

- training.json: training loss and validation AP (grew) every 500 steps for the two final-config seeds,
  from results/citywide/m4/unitcls_m4s_s{0,1}_train.csv. Seed 0 is the final model.
- backbones.json: single-image height error of the three backbones (stage 2, held-out ZIPs and years),
  from results/height_model_pilot/metrics.csv.
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web/public/data/model"
OUT.mkdir(parents=True, exist_ok=True)

runs = {}
for seed in (0, 1):
    t = pd.read_csv(ROOT / f"results/citywide/m4/unitcls_m4s_s{seed}_train.csv")
    runs[f"seed {seed}"] = [{"step": int(r.iter), "stage": int(r.stage), "loss": round(float(r.loss), 4),
                             "ap_grew": round(float(r.val_ap_grew), 4)} for r in t.itertuples()]
# image-differencing baseline on the same validation units (scripts/baseline_imgdiff.py): best of its three scores
bl = json.load(open(ROOT / "results/citywide/m4/baseline_imgdiff.json"))["baseline"]
baseline_ap = max(s["grew_ap"] for s in bl.values())
json.dump({"final": "seed 0", "frozen_until": 4000, "runs": runs, "baseline_ap": baseline_ap},
          open(OUT / "training.json", "w"), indent=1)

m = pd.read_csv(ROOT / "results/height_model_pilot/metrics.csv")
names = {"unet_r025": "U-Net, ImageNet", "dino_linear_r025": "DINOv3, frozen", "dino_dpt_r025": "DINOv3, fine-tuned"}
bb = []
for tag, name in names.items():
    d = m[m.tag == tag]
    bb.append({"model": name, "runs": [{"zip": str(r.zip), "year": int(r.year), "mae": round(float(r.bldg_mae), 2)}
                                       for r in d.itertuples()],
               "mae_min": round(float(d.bldg_mae.min()), 2), "mae_max": round(float(d.bldg_mae.max()), 2)})
json.dump({"task": "building height from one photo, held-out ZIPs 19146/19147, years 2022 and 2025",
           "metric": "building-level MAE (m)", "models": bb}, open(OUT / "backbones.json", "w"), indent=1)
print(json.dumps(bb, indent=1)[:600])

# ZIP codes by role (learning = training and validation blocks, test = sealed), simplified, for the data picture
import geopandas as gpd  # noqa: E402

sp = pd.read_csv(ROOT / "results/citywide/splits_citywide_zips.csv", dtype={"zip": str})
z = gpd.read_file(ROOT / "data/raw/boundaries/zip_codes.geojson")[["code", "geometry"]].rename(columns={"code": "zip"})
used = set(pd.read_csv(ROOT / "data/interim/m4_patches.csv", dtype={"zip": str}).zip)   # ZIPs with training patches
test = set(sp[sp.role == "test"].zip)
z["role"] = ["test" if c in test else "learning" if c in used else "outside" for c in z.zip]
z["geometry"] = z.to_crs(2272).geometry.simplify(150).to_crs(4326)
z[["zip", "role", "geometry"]].to_file(OUT / "zips.geojson", driver="GeoJSON")
print(z.role.value_counts().to_dict())
