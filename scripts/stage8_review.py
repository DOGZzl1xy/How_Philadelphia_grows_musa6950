"""Stage 8, amendment 2: blind page for the author's check of marked buildings (results/citywide/stage8_plan.md).

Draws 60 buildings judged taller (2018-2025) at random and mixes in 20 judged "no change", in random order and without
the verdicts. Each card shows the building's timeline photographs; the author answers taller / new building / no
change / unclear. Answers are kept in the browser and exported as review_marked_labels.csv; `--score FILE` compares
them with the verdicts.

Output, local only: data/interim/stage8/map/review.html and review_key.csv (the photographs are read from ../views/).
Run: uv run python scripts/stage8_review.py            then, with the exported file:
     uv run python scripts/stage8_review.py --score path/to/review_marked_labels.csv
"""
import argparse
import json
import random
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data/interim/stage8"
OUT = D / "map"
NAME = json.loads((ROOT / "results/citywide/stage8/FROZEN").read_text())["name"]
N_TALLER, N_SAME, SEED = 60, 20, 6950


def wilson(k, n, z=1.96):
    if n == 0:
        return float("nan"), float("nan")
    p = k / n
    d = 1 + z * z / n
    c, h = (p + z * z / (2 * n)) / d, z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return c - h, c + h


def score(path):
    key = pd.read_csv(OUT / "review_key.csv", dtype={"zip": str})
    lab = pd.read_csv(path)
    m = key.merge(lab, on="code", how="left")
    m["answer"] = m.verdict.fillna("")
    t = m[m.cls.isin(["t1", "t2", "t3"])]
    done = t[t.answer != ""]
    clear = done[done.answer != "unclear"]
    right = int(clear.answer.isin(["taller"]).sum())
    lo, hi = wilson(right, len(clear))
    print(f"marked taller: {len(t)} drawn, {len(done)} answered, {int((done.answer == 'unclear').sum())} unclear")
    print(f"  author says taller: {right} of {len(clear)} = {right / max(len(clear), 1):.0%} (95% interval {lo:.0%}-{hi:.0%})")
    print("  other answers:", clear[clear.answer != "taller"].answer.value_counts().to_dict())
    s = m[(m.cls == "same") & (m.answer != "") & (m.answer != "unclear")]
    print(f"judged no change: author agrees on {int((s.answer == 'no_change').sum())} of {len(s)}")
    res = {"marked_drawn": int(len(t)), "answered": int(len(done)), "unclear": int((done.answer == "unclear").sum()),
           "taller_confirmed": right, "of": int(len(clear)), "share": right / max(len(clear), 1), "ci95": [lo, hi],
           "no_change_agreed": int((s.answer == "no_change").sum()), "no_change_of": int(len(s))}
    (ROOT / "results/citywide/stage8/review_marked.json").write_text(json.dumps(res, indent=1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--score", default="")
    a = ap.parse_args()
    if a.score:
        return score(a.score)
    t = pd.read_csv(OUT / "buildings.csv", dtype={"zip": str})
    pick = pd.concat([t[t.cls.isin(["t1", "t2", "t3"])].sample(N_TALLER, random_state=SEED),
                      t[t.cls == "same"].sample(N_SAME, random_state=SEED)]).sample(frac=1, random_state=SEED)
    rng = random.Random(SEED)
    pick["code"] = rng.sample(range(100, 1000), len(pick))
    pick[["code", "zip", "unit", "cls", "t0", "t1", "src"]].to_csv(OUT / "review_key.csv", index=False)
    photos = {}
    for z in pick.zip.unique():
        used = {json.loads(line)["unit"]: json.loads(line).get("slots") for line in open(D / "judge" / f"{z}_{NAME}.jsonl")}
        for line in open(D / "photos" / f"{z}.jsonl"):
            r = json.loads(line)
            if r["unit"] in used:
                photos[(z, r["unit"])] = [p for p in r["photos"] if p["slot"] in (used[r["unit"]] or [])]
    cards = []
    for n, r in enumerate(pick.itertuples(), 1):
        figs = "".join(f'<figure><img loading="lazy" src="../views/{r.zip}/{p["file"]}" alt="photograph {p["date"]}">'
                       f'<figcaption>{p["date"]}</figcaption></figure>' for p in photos[(r.zip, r.unit)])
        cards.append(f"""<section class=card><h2>{n} / {len(pick)} <span>#{r.code}</span></h2><div class=ph>{figs}</div>
<fieldset><label><input type=radio name="v{r.code}" value="taller"> 变高了（加层、屋顶加建、重建后更高）</label>
<label><input type=radio name="v{r.code}" value="new_building"> 原来是空地，后来新建</label>
<label><input type=radio name="v{r.code}" value="no_change"> 没变</label>
<label><input type=radio name="v{r.code}" value="unclear"> 看不清 / 无法判断</label>
<input type=text name="n{r.code}" placeholder="备注（可不填）"></fieldset></section>""")
    codes = pick.code.tolist()
    (OUT / "review.html").write_text(PAGE.replace("__CARDS__", "\n".join(cards)).replace("__CODES__", json.dumps(codes))
                                     .replace("__N__", str(len(codes))))
    print(f"written {OUT / 'review.html'}: {len(codes)} buildings ({N_TALLER} judged taller, {N_SAME} judged no change, mixed)")


PAGE = """<!doctype html><html lang=zh><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>标出的房子：人工抽查</title><style>
body{font:15px/1.5 system-ui,"Microsoft YaHei",sans-serif;background:#f6f4ef;color:#222;margin:0;padding:16px 16px 90px}
h1{font-size:20px;margin:0 0 6px} p.intro{max-width:980px;margin:0 0 18px;color:#444}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px 14px;margin:0 auto 18px;max-width:1700px}
.card h2{font-size:15px;margin:0 0 8px} .card h2 span{color:#999;font-weight:400;margin-left:8px}
.ph{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px} figure{margin:0} img{width:100%;display:block;border-radius:4px}
figcaption{font-size:13px;color:#555;padding:4px 2px}
fieldset{border:0;padding:8px 0 0;margin:0;display:flex;flex-wrap:wrap;gap:6px 18px;align-items:center}
label{cursor:pointer} input[type=text]{flex:1;min-width:220px;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font:inherit}
#bar{position:fixed;left:0;right:0;bottom:0;background:#fff;border-top:1px solid #ccc;padding:10px 16px;display:flex;gap:14px;align-items:center}
button{font:inherit;padding:7px 14px;border:1px solid #c8600a;background:#e8730c;color:#fff;border-radius:5px;cursor:pointer}
#out{flex:1;font:12px/1.4 ui-monospace,monospace;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head><body>
<h1>街景时间线：__N__ 栋房子的人工抽查</h1>
<p class=intro>每组是同一栋房子不同年份的街景，按时间从早到晚排列。每张图顶部中间的橙色小三角指向<b>目标房子</b>。请判断目标房子在这段时间里是否变高了：只换立面、刷漆、换窗不算，隔壁的变化不算。页面不显示任何模型的判断，其中混有一部分模型认为没变的房子。选择会自动保存在浏览器里；做完后点“导出 CSV”，或点“复制结果”把一行文字贴回对话。</p>
__CARDS__
<div id=bar><button id=exp>导出 CSV</button><button id=cp>复制结果</button><span id=count></span><span id=out></span></div>
<script>
const KEY="sv_marked_v1",codes=__CODES__;let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}
for(const c of codes){if(saved["v"+c]){const el=document.querySelector(`input[name="v${c}"][value="${saved["v"+c]}"]`);if(el)el.checked=true}if(saved["n"+c])document.querySelector(`input[name="n${c}"]`).value=saved["n"+c]}
function collect(){const a={};for(const c of codes){const r=document.querySelector(`input[name="v${c}"]:checked`);a["v"+c]=r?r.value:"";a["n"+c]=document.querySelector(`input[name="n${c}"]`).value}return a}
function line(a){return codes.map(c=>c+":"+(a["v"+c]||"-")+(a["n"+c]?"("+a["n"+c]+")":"")).join("; ")}
function update(){const a=collect();try{localStorage.setItem(KEY,JSON.stringify(a))}catch(e){}
document.getElementById("count").textContent=codes.filter(c=>a["v"+c]).length+" / "+codes.length+" 已判";document.getElementById("out").textContent=line(a)}
document.addEventListener("input",update);update();
const esc=s=>'"'+String(s||"").replace(/"/g,'""')+'"';
document.getElementById("exp").onclick=()=>{const a=collect();const csv="code,verdict,note\\n"+codes.map(c=>[c,a["v"+c],esc(a["n"+c])].join(",")).join("\\n")+"\\n";
const el=document.createElement("a");el.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));el.download="review_marked_labels.csv";el.click()};
document.getElementById("cp").onclick=()=>{const t=line(collect());(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).catch(()=>prompt("复制这一行：",t))};
</script></body></html>
"""


if __name__ == "__main__":
    main()
