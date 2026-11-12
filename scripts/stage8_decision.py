"""Stage 8, amendment 3: candidates outside the hot cells, read by Gemini Decision 1 (results/citywide/stage8_plan.md).

The same photographs as for Gemini 3.8 Flash (slots with the older baseline). Decision 1 writes no text: it answers
two closed questions per house with probabilities, the verdict (taller, new building, no change, unclear) and the first
photograph in which the house is taller. Only observable candidates that Flash has not judged are sent.

Output (never committed): data/interim/stage8/judge/{zip}_dec1.jsonl, resumable, in the layout of the Flash files
(verdict, dates, slots, last_before, first_after) plus the probabilities. Spending goes into the same spend.json; the
run stops at the combined cap and at the first refusal by the provider, without trying again.
Key: GEMINI_API_KEY from web/.dev.vars, read locally.

Run: uv run python scripts/stage8_decision.py [--zips 19104,19121] [--limit N]
"""
import argparse
import base64
import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/interim/stage8"
URL = "https://generativelanguage.googleapis.com/v1beta/decisions"
MODEL, RESOLUTION = "gemini-decision-1", "high"
PRICE_IN = 0.10                       # USD per 1M input tokens, no charge for output (Google, 2026-11-11)
CAP_USD = 58.5                        # all model calls of the stage together; the author's limit at the provider is 60
STOP = OUT / "judge" / "PROVIDER_REFUSED"
FLASH = json.loads((ROOT / "results/citywide/stage8/FROZEN").read_text())["name"]

INTRO = ("Street-level photographs of the same spot in date order; the camera position may differ slightly between them. "
         "In every photograph a small orange triangle at the top centre marks the horizontal position of the TARGET building: "
         "the building directly below the triangle.")
VERDICT = {"type": "choice", "instructions": "What happened to the target building over this series of photographs?", "criteria": {
    "taller": "The target gained height between two photographs: an added storey, a rooftop addition, or it was rebuilt taller.",
    "new_building": "In the first photograph the target lot is empty (vacant land, parking, a fenced lot) and a later photograph shows a building on it.",
    "no_change": "The same number of storeys and the same roof line throughout. A new facade, cladding, paint or windows alone is not a change in height. A change on a neighbouring building does not count.",
    "unclear": "The target is hidden by trees or vehicles, the view is too oblique, or the photographs do not show the same building."}}

lock = threading.Lock()
stop = threading.Event()


def key():
    for line in (ROOT / "web/.dev.vars").read_text().splitlines():
        if line.startswith("GEMINI_API_KEY"):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("GEMINI_API_KEY not found in web/.dev.vars")


def spend(add=0.0):
    f = OUT / "judge" / "spend.json"
    with lock:
        s = json.loads(f.read_text()) if f.exists() else {"usd": 0.0, "calls": 0}
        if add:
            s["usd"] += add
            s["calls"] += 1
            s["decision_usd"] = s.get("decision_usd", 0.0) + add
            f.write_text(json.dumps(s))
        return s["usd"]


def ask(rec, k):
    if stop.is_set():
        return None
    z, photos = rec["zip"], rec["photos"]
    inp = [{"type": "text", "text": INTRO}]
    for n, p in enumerate(photos, 1):
        inp += [{"type": "text", "text": f"Photograph {n} ({p['date']}):"},
                {"type": "image", "data": base64.b64encode((OUT / "views" / z / p["file"]).read_bytes()).decode(),
                 "mime_type": "image/jpeg", "resolution": RESOLUTION}]
    first = {"type": "choice", "instructions": "Which is the first photograph in which the target building is taller than in photograph 1 (or newly built)?",
             "criteria": {**{f"photograph_{n}": f"Photograph {n} is the first one that shows the target taller or newly built." for n in range(2, len(photos) + 1)},
                          "never": "The target is never taller than in photograph 1."}}
    out = {"zip": z, "unit": rec["unit"], "tier": rec["tier"], "dates": [p["date"] for p in photos],
           "slots": [p["slot"] for p in photos], "reader": MODEL}
    for attempt in range(2):
        try:
            r = requests.post(URL, json={"model": MODEL, "input": inp, "questions": {"verdict": VERDICT, "first_taller": first}},
                              headers={"x-goog-api-key": k, "content-type": "application/json"}, timeout=120)
        except requests.RequestException as e:           # the network, not the provider: one more try
            out["error"] = f"{type(e).__name__}: {str(e)[:100]}"
            time.sleep(5)
            continue
        if r.status_code != 200:                         # refused or limited: stop everything, do not try again
            out["error"] = f"HTTP {r.status_code}: {r.text[:200]}"
            stop.set()
            STOP.write_text(f"{time.strftime('%Y-%m-%d %H:%M')} {MODEL} {out['error']}\n")
            return out
        d = r.json()
        tok = d["usage"]["total_input_tokens"]
        usd = tok * PRICE_IN / 1e6
        spend(usd)
        a, f = d["answers"]["verdict"], d["answers"]["first_taller"]
        n = int(f["choice"].split("_")[1]) if f["choice"].startswith("photograph_") else None
        out.update(verdict=a["choice"], confidence=round(a["confidence"], 3),
                   probabilities={x: round(v, 3) for x, v in a["probabilities"].items()},
                   first_after=n, last_before=n - 1 if n else None, first_confidence=round(f["confidence"], 3),
                   reason="", tok_in=tok, usd=usd)
        out.pop("error", None)
        return out
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zips", default="all")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    if STOP.exists():
        raise SystemExit(f"not calling the provider: {STOP.read_text().strip()} (delete {STOP} once the author says so)")
    k = key()
    cand = pd.read_parquet(OUT / "candidates.parquet")
    hot = set(zip(cand[cand.hot].zip, cand[cand.hot].unit))
    zips = sorted(p.stem for p in (OUT / "photos").glob("1*.jsonl")) if a.zips == "all" else a.zips.split(",")
    total = 0
    for z in zips:
        recs = [json.loads(line) for line in (OUT / "photos" / f"{z}.jsonl").open()]
        fj = OUT / "judge" / f"{z}_{FLASH}.jsonl"
        flash = {json.loads(line)["unit"] for line in fj.open()} if fj.exists() else set()
        log = OUT / "judge" / f"{z}_dec1.jsonl"
        done = {json.loads(line)["unit"] for line in log.open()} if log.exists() else set()
        todo = [r for r in recs if r["status"] == "ok" and r["unit"] not in flash and r["unit"] not in done and (z, r["unit"]) not in hot]
        if a.limit:
            todo = todo[:max(0, a.limit - total)]
        if not todo:
            continue
        total += len(todo)
        with log.open("a") as out, ThreadPoolExecutor(a.workers) as ex:
            for res in ex.map(lambda r: ask(r, k), todo):
                if res is None:
                    continue
                if "error" in res:
                    print("  error", z, res["unit"], res["error"], flush=True)
                    continue
                out.write(json.dumps(res) + "\n")
                out.flush()
                if spend() >= CAP_USD:
                    stop.set()
        d = pd.DataFrame([json.loads(line) for line in log.open()]) if log.stat().st_size else pd.DataFrame()
        if len(d):
            print(f"{z}: {len(d)} read by Decision 1, {d.verdict.value_counts().to_dict()}; total spent ${spend():.2f}", flush=True)
        if stop.is_set():
            raise SystemExit("stopped: the provider refused a call, or the spending cap is reached")


if __name__ == "__main__":
    main()
