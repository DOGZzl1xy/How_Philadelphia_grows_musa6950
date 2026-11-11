"""Stage 8, step 3: Gemini reads each unit's timeline of street-level photographs (results/citywide/stage8_plan.md).

One call per observable unit: the fixed instruction, then every photograph with its date, in date order. The model
gets no address, coordinate, permit or score. Answer: storeys per photograph, the last photograph in which the target is
clearly not yet taller, the first in which it is, and a verdict (taller, new_building, no_change, unclear).

Output (never committed): data/interim/stage8/judge/{zip}_{tag or name}.jsonl, resumable; spending is added up in
data/interim/stage8/judge/spend.json and the run stops at the cap of the plan ($40) unless a new cap is approved.
Key: GEMINI_API_KEY from web/.dev.vars, read locally. Sealed ZIP codes are refused until
results/citywide/stage8/FROZEN exists.

Run: uv run python scripts/stage8_judge.py --zips 19146 --tag v1 [--tiers 1] [--limit N] [--units 23,41]
"""
import argparse
import base64
import json
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/interim/stage8"
FROZEN = ROOT / "results/citywide/stage8/FROZEN"
MODEL = "gemini-3.8-flash"
URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
PRICE_IN, PRICE_OUT = 0.75, 3.75   # USD per 1M tokens, as in web/worker/index.ts (valid to 2026-12-31)
CAP_USD = 40.0

PROMPTS = {"v1": """You get {n} street-level photographs of the same spot in date order; the date is given before each photograph and the camera position may differ slightly between them. In every photograph a small orange triangle at the top centre marks the horizontal position of the TARGET building: the building directly below the triangle.

Decide whether the target building became taller at some point in this series, and between which photographs.
- "taller": the target gained height between two photographs: an added storey, a rooftop addition (also one set back from the facade), or it was rebuilt taller.
- "new_building": in the first photograph the target lot is empty (vacant land, parking, a fenced lot) and a later photograph shows a building on it.
- "no_change": the same number of storeys and the same roof line throughout. A new facade, cladding, paint, windows or cornice alone is not a change in height. A change on a neighbouring building does not count.
- "unclear": the target is hidden (trees, vehicles), the view is too oblique, or the photographs do not show the same building.

Answer with one JSON object and nothing else:
{{"storeys": [<storeys of the target in each photograph, in order; null where it cannot be seen>], "last_before": <number of the last photograph in which the target is clearly not yet taller, or null>, "first_after": <number of the first photograph in which the target is taller or newly built, or null>, "verdict": "taller" | "new_building" | "no_change" | "unclear", "reason": "<at most 25 words>"}}""",
           "v2": """You get {n} street-level photographs of the same spot in date order; the date is given before each photograph and the camera position may differ slightly between them. In every photograph a small orange triangle at the top centre marks the horizontal position of the TARGET building: the building directly below the triangle.

Decide whether the target building became taller at some point in this series, and between which photographs.
- "taller": the target gained height between two photographs: an added storey, a rooftop addition, or it was rebuilt taller. Additions are often set back from the facade, so that from the street only their top shows above the old roof line: a new upper wall, a stair or pilot house, or a new roof deck with its railing above the cornice also counts as taller.
- "new_building": in the first photograph the target lot is empty (vacant land, parking, a fenced lot) and a later photograph shows a building on it.
- "no_change": the same number of storeys and the same roof line throughout. A new facade, cladding, paint, windows or cornice alone is not a change in height. A change on a neighbouring building does not count.
- "unclear": the target is hidden (trees, vehicles), the view is too oblique, or the photographs do not show the same building.

Answer with one JSON object and nothing else:
{{"storeys": [<storeys of the target in each photograph, in order; null where it cannot be seen>], "last_before": <number of the last photograph in which the target is clearly not yet taller, or null>, "first_after": <number of the first photograph in which the target is taller or newly built, or null>, "verdict": "taller" | "new_building" | "no_change" | "unclear", "reason": "<at most 25 words>"}}"""}

lock = threading.Lock()


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
            f.write_text(json.dumps(s))
        return s["usd"]


def ask(rec, tag, k, old_baseline=False):
    z = rec["zip"]
    photos = [p for p in rec["photos"] if old_baseline or p["slot"] != "00"]
    content = [{"type": "text", "text": PROMPTS[tag].format(n=len(photos))}]
    for n, p in enumerate(photos, 1):
        b = base64.b64encode((OUT / "views" / z / p["file"]).read_bytes()).decode()
        content += [{"type": "text", "text": f"Photograph {n} ({p['date']}):"},
                    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + b}}]
    body = {"model": MODEL, "reasoning_effort": "low", "max_tokens": 2500, "messages": [{"role": "user", "content": content}]}
    out = {"zip": z, "unit": rec["unit"], "tier": rec["tier"], "dates": [p["date"] for p in photos],
           "slots": [p["slot"] for p in photos], "verdict": "error"}
    for attempt in range(4):
        try:
            t0 = time.time()
            r = requests.post(URL, json=body, headers={"Authorization": f"Bearer {k}"}, timeout=120)
            if r.status_code == 429 and "spending cap" in r.text:
                out["reason"] = "the Gemini project's own monthly spending cap is reached (set in AI Studio)"
                out["stop"] = True
                return out
            if r.status_code != 200:
                out["reason"] = f"HTTP {r.status_code}: {r.text[:160]}"
                time.sleep(4 + 6 * attempt)
                continue
            d = r.json()
            u = d.get("usage", {})
            t_in = u.get("prompt_tokens", 0)
            t_out = max(u.get("total_tokens", 0) - t_in, u.get("completion_tokens", 0))
            usd = (t_in * PRICE_IN + t_out * PRICE_OUT) / 1e6
            spend(usd)
            out.update(tok_in=t_in, tok_out=t_out, usd=usd, sec=round(time.time() - t0, 1))
            j = json.loads(re.search(r"\{.*\}", d["choices"][0]["message"]["content"] or "", re.S).group(0))
            out.update(verdict=j.get("verdict"), storeys=j.get("storeys"), last_before=j.get("last_before"),
                       first_after=j.get("first_after"), reason=j.get("reason"))
            return out
        except Exception as e:  # noqa: BLE001
            out["reason"] = f"{type(e).__name__}: {str(e)[:120]}"
            time.sleep(4 + 6 * attempt)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zips", required=True)
    ap.add_argument("--tag", default="v1")
    ap.add_argument("--tiers", default="1,2")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--units", default="")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--prefix", default="", help="photo log prefix, e.g. val_ for the validation-block check")
    ap.add_argument("--name", default="", help="label of the output file when it differs from the prompt tag (development variants)")
    ap.add_argument("--old-baseline", action="store_true", help="development: include slot 00 (latest photograph before 2016)")
    a = ap.parse_args()
    k = key()
    (OUT / "judge").mkdir(parents=True, exist_ok=True)
    cand = pd.read_parquet(OUT / "candidates.parquet")
    tiers = [int(t) for t in a.tiers.split(",")]
    for z in a.zips.split(","):
        area = cand[cand.zip == z].area.iloc[0] if (cand.zip == z).any() else "dev"
        if area != "dev" and not a.prefix:      # outside the development ZIP only the frozen settings are used
            if not FROZEN.exists():
                raise SystemExit(f"{z} is outside the development ZIP code and the settings are not frozen yet")
            fz = json.loads(FROZEN.read_text())
            a.tag, a.name, a.old_baseline, tiers = fz["prompt"], fz["name"], fz["old_baseline"], fz["tiers"]
        recs = [json.loads(line) for line in (OUT / "photos" / f"{a.prefix}{z}.jsonl").open()]
        recs = [r for r in recs if r["status"] == "ok" and r["tier"] in tiers]
        if a.units:
            keep = {int(x) for x in a.units.split(",")}
            recs = [r for r in recs if r["unit"] in keep]
        log = OUT / "judge" / f"{a.prefix}{z}_{a.name or a.tag}.jsonl"
        done = {json.loads(line)["unit"] for line in log.open()} if log.exists() else set()
        todo = [r for r in recs if r["unit"] not in done]
        if a.limit:
            todo = todo[:a.limit]
        print(f"{z} {a.tag}: {len(recs)} observable units, {len(done)} done, {len(todo)} to do; spent so far ${spend():.2f}", flush=True)
        t0, errors = time.time(), 0
        with log.open("a") as out, ThreadPoolExecutor(a.workers) as ex:
            for n, res in enumerate(ex.map(lambda r: ask(r, a.tag, k, a.old_baseline), todo), 1):
                if res["verdict"] != "error":
                    out.write(json.dumps(res, ensure_ascii=False) + "\n")
                    out.flush()
                else:
                    print("  error", res["unit"], res.get("reason"), flush=True)
                    errors += 1
                    if res.get("stop") or errors >= 20:
                        ex.shutdown(wait=False, cancel_futures=True)
                        raise SystemExit("stopping: " + str(res.get("reason")))
                if n % 100 == 0:
                    print(f"  {n}/{len(todo)}  ${spend():.2f} spent  {(time.time() - t0) / n:.1f} s per unit", flush=True)
                if spend() >= CAP_USD:
                    raise SystemExit(f"spending cap of ${CAP_USD:.0f} reached; stopping")
        d = pd.DataFrame([json.loads(line) for line in log.open()])
        if len(d):
            print(f"{z} {a.tag}: {d.verdict.value_counts().to_dict()}; ${d.usd.sum():.2f} for {len(d)} units "
                  f"(${d.usd.mean():.4f} each, tokens in {d.tok_in.mean():.0f} out {d.tok_out.mean():.0f}); total spent ${spend():.2f}", flush=True)


if __name__ == "__main__":
    main()
