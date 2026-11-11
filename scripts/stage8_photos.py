"""Stage 8, step 2: street-level photographs for the candidates of some ZIP codes (results/citywide/stage8_plan.md).

Per unit: the capture point nearest the lot (at most 30 m; up to 4 points tried, the first with photographs in both
waves is used), its captures over the years (official car captures within 35 m of the lot), one photograph per slot,
and for observable units a flat view cut from each panorama, aimed at the side of the lot that faces the camera.

Slots: 0 latest in 2016-01..2018-04 | 1 earliest in 2018-05..2019-12 | 1b latest in 2018-05..2019-12 if another year
| 2 latest in 2020-01..2023-12 | 3 latest in 2024-01..2025-06, else the earliest after that.
Observable: a photograph in 2016-01..2019-12 and one from 2024-01 on.
Extra, for development only: slot 00 = latest before 2016 when slot 0 is empty (an older baseline; the judge leaves it
out unless asked).

Output (never committed): data/interim/stage8/photos/{zip}.jsonl (one line per unit with every capture found, resumable),
data/interim/stage8/views/{zip}/{unit}_{slot}_{date}.jpg, panoramas cached in data/interim/stage8/panos/.
Sealed ZIP codes are refused until results/citywide/stage8/FROZEN exists (amendment 1 of the plan).

Run: uv run --with streetlevel python scripts/stage8_photos.py --zips 19146 [--tiers 1,2] [--limit N]
"""
import argparse
import json
import math
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
from PIL import Image, ImageDraw
from pyproj import Transformer
from shapely.geometry import Point
from streetlevel import streetview as sl

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/interim/stage8"
FROZEN = ROOT / "results/citywide/stage8/FROZEN"
ZOOM, SIZE, HFOV, PITCH = 3, 720, 95.0, 22.0
MAX_SPOT_M, MAX_CAPTURE_M, MAX_SPOTS = 30, 35, 4
TO_FT = Transformer.from_crs(4326, 2272, always_xy=True)
TO_LL = Transformer.from_crs(2272, 4326, always_xy=True)
fails = 0


def call(fn, *a, **k):
    """A request with retries; stops the run after 20 failures in a row (nothing is done to get around a refusal)."""
    global fails
    for attempt in range(3):
        try:
            r = fn(*a, **k)
            fails = 0
            return r
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(2 + 4 * attempt)
    fails += 1
    print("  request failed:", type(err).__name__, str(err)[:100], flush=True)
    if fails >= 20:
        raise SystemExit("20 requests failed in a row; stopping")
    return None


def ym(p):
    return f"{p.date.year}-{p.date.month:02d}" if p.date else None


def official(p):
    return len(p.id) == 22


def dist_m(poly, lon, lat):
    x, y = TO_FT.transform(lon, lat)
    return poly.distance(Point(x, y)) * 0.3048006096


def slots(tl):
    """tl: captures sorted by date. Returns [(slot, capture)] in date order."""
    def pick(lo, hi, last):
        c = [p for p in tl if lo <= p["date"] <= hi]
        return (c[-1] if last else c[0]) if c else None
    out = []
    s0, s1, s1b = pick("2016-01", "2018-04", True), pick("2018-05", "2019-12", False), pick("2018-05", "2019-12", True)
    s2, s3 = pick("2020-01", "2023-12", True), pick("2024-01", "2025-06", True) or pick("2025-07", "9999-99", False)
    if s0: out.append(("0", s0))
    elif pick("2007-01", "2015-12", True): out.append(("00", pick("2007-01", "2015-12", True)))
    if s1: out.append(("1", s1))
    if s1b and s1 and s1b["date"][:4] != s1["date"][:4]: out.append(("1b", s1b))
    if s2: out.append(("2", s2))
    if s3: out.append(("3", s3))
    return out


def observable(sl_):
    return any(s in ("0", "1", "1b") for s, _ in sl_) and any(s == "3" for s, _ in sl_)


def timeline(poly, cache):
    c = poly.centroid
    lon, lat = TO_LL.transform(c.x, c.y)
    pano = call(sl.find_panorama, lat, lon, radius=50)
    time.sleep(0.1)
    if pano is None:
        return None
    cand = [p for p in [pano] + list(pano.neighbors or []) if official(p)]
    spots = sorted(((dist_m(poly, p.lon, p.lat), i, p) for i, p in enumerate(cand)), key=lambda t: t[0])
    best, tried = None, 0
    for d0, _, sp in spots:
        if d0 > MAX_SPOT_M or tried >= MAX_SPOTS:
            break
        tried += 1
        if sp.id not in cache:
            full = pano if sp.id == pano.id else call(sl.find_panorama_by_id, sp.id)
            time.sleep(0.1)
            cache[sp.id] = None if full is None else [
                {"id": p.id, "lat": p.lat, "lon": p.lon, "date": ym(p)}
                for p in [full] + list(full.historical or []) if official(p) and p.date]
        caps = cache[sp.id]
        if caps is None:
            continue
        tl = [dict(p, dist_m=round(dist_m(poly, p["lon"], p["lat"]), 1)) for p in caps]
        tl = sorted([p for p in tl if p["dist_m"] <= MAX_CAPTURE_M], key=lambda p: p["date"])
        sl_ = slots(tl)
        score = (observable(sl_), len(tl))
        if best is None or score > best[0]:
            best = (score, round(d0, 1), tl, sl_)
        if score[0]:
            break
    return best


def bearing(lat1, lon1, lat2, lon2):
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    return math.degrees(math.atan2(math.sin(dl) * math.cos(p2),
                                   math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl))) % 360


def view(pano, yaw_deg):
    """Flat view from an equirectangular panorama; yaw is measured from the image centre."""
    src = np.asarray(pano.convert("RGB"))
    H, W = src.shape[:2]
    f = (SIZE / 2) / math.tan(math.radians(HFOV) / 2)
    i, j = np.meshgrid(np.arange(SIZE) - SIZE / 2 + 0.5, np.arange(SIZE) - SIZE / 2 + 0.5)
    x, y, z = i / f, -j / f, np.ones_like(i)
    p = math.radians(PITCH)
    y2, z2 = y * math.cos(p) + z * math.sin(p), -y * math.sin(p) + z * math.cos(p)
    lon = np.arctan2(x, z2) + math.radians(yaw_deg)
    lat = np.arctan2(y2, np.hypot(x, z2))
    u = ((0.5 + lon / (2 * math.pi)) % 1.0) * W
    v = np.clip((0.5 - lat / math.pi) * H, 0, H - 1)
    out = Image.fromarray(src[v.astype(int), u.astype(int) % W])
    ImageDraw.Draw(out).polygon([(SIZE / 2 - 9, 0), (SIZE / 2 + 9, 0), (SIZE / 2, 16)], fill=(255, 120, 0))
    return out


def panorama(pid):
    """Panorama and its heading (degrees from north at the image centre); cached on disk."""
    f, h = OUT / "panos" / f"{pid}.jpg", OUT / "panos" / f"{pid}.json"
    if f.exists() and h.exists():
        return Image.open(f), json.loads(h.read_text())["heading"]
    full = call(sl.find_panorama_by_id, pid)
    if full is None:
        return None, None
    im = call(sl.get_panorama, full, zoom=ZOOM)
    if im is None:
        return None, None
    im.save(f, quality=88)
    h.write_text(json.dumps({"heading": math.degrees(full.heading), "lat": full.lat, "lon": full.lon}))
    return im, math.degrees(full.heading)


def target(poly, lon, lat):
    """Middle of the side of the lot that faces the camera, 2 m inside the lot (longitude, latitude)."""
    g = Point(*TO_FT.transform(lon, lat))
    xy = list(poly.minimum_rotated_rectangle.exterior.coords)
    mids = [Point((xy[n][0] + xy[n + 1][0]) / 2, (xy[n][1] + xy[n + 1][1]) / 2) for n in range(4)]
    near, c = min(mids, key=g.distance), poly.centroid
    k = min(1.0, (2 / 0.3048006096) / max(near.distance(c), 1e-6))
    return TO_LL.transform(near.x + (c.x - near.x) * k, near.y + (c.y - near.y) * k)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zips", required=True)
    ap.add_argument("--tiers", default="1,2")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    cand = pd.read_parquet(OUT / "candidates.parquet")
    tiers = [int(t) for t in a.tiers.split(",")]
    for z in a.zips.split(","):
        c = cand[(cand.zip == z) & cand.tier.isin(tiers)].sort_values(["tier", "unit"])
        if (c.area == "sealed").any() and not FROZEN.exists():
            raise SystemExit(f"{z} is a sealed ZIP code and the settings are not frozen yet")
        (OUT / "photos").mkdir(parents=True, exist_ok=True)
        (OUT / "panos").mkdir(exist_ok=True)
        (OUT / "views" / z).mkdir(parents=True, exist_ok=True)
        log = OUT / "photos" / f"{z}.jsonl"
        done = {json.loads(line)["unit"] for line in log.open()} if log.exists() else set()
        todo = c[~c.unit.isin(done)]
        if a.limit:
            todo = todo.head(a.limit)
        units = gpd.read_parquet(ROOT / f"data/interim/citywide_units/{z}.parquet").set_index("unit")
        print(f"{z}: {len(c)} candidates, {len(done)} done, {len(todo)} to do", flush=True)
        cache, t0, n_ok = {}, time.time(), 0
        with log.open("a") as out:
            for k, r in enumerate(todo.itertuples(), 1):
                poly = units.loc[r.unit].geometry
                rec = {"zip": z, "unit": int(r.unit), "tier": int(r.tier), "status": "no_coverage", "spot_m": None,
                       "dates": [], "captures": [], "photos": []}
                best = timeline(poly, cache)
                if best is not None:
                    _, d0, tl, sl_ = best
                    rec.update(spot_m=d0, dates=[p["date"] for p in tl], captures=tl,
                               status="ok" if observable(sl_) else "not_observable")
                    if rec["status"] == "ok":
                        for n, (slot, p) in enumerate(sl_, 1):
                            im, heading = panorama(p["id"])
                            if im is None:
                                rec["status"] = "download_failed"
                                break
                            tlon, tlat = target(poly, p["lon"], p["lat"])
                            yaw = (bearing(p["lat"], p["lon"], tlat, tlon) - heading + 180) % 360 - 180
                            f = OUT / "views" / z / f"{r.unit}_{slot}_{p['date']}.jpg"
                            view(im, yaw).save(f, quality=88)
                            rec["photos"].append({"n": n, "slot": slot, "id": p["id"], "date": p["date"],
                                                  "dist_m": p["dist_m"], "file": f.name})
                        n_ok += rec["status"] == "ok"
                out.write(json.dumps(rec) + "\n")
                out.flush()
                if k % 100 == 0:
                    el = time.time() - t0
                    print(f"  {k}/{len(todo)}  observable {n_ok}  {el / k:.1f} s per unit, about {el / k * (len(todo) - k) / 60:.0f} min left", flush=True)
        d = pd.DataFrame([json.loads(line) for line in log.open()])
        print(f"{z} done: {d.status.value_counts().to_dict()}; photographs per observable unit "
              f"{d[d.status == 'ok'].photos.apply(len).mean():.2f}", flush=True)


if __name__ == "__main__":
    main()
