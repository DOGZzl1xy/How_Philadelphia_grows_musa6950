"""Stage 8, amendment 2: the local map of buildings seen taller from the street (results/citywide/stage8_plan.md).

Reads every ZIP code that has photographs and verdicts, classifies each judged candidate, and writes, under
data/interim/stage8/map/ (never committed or published: the files hold addresses and single buildings):
  buildings.csv   one row per candidate: address, verdict, the two photographs between which it changed, source
  data.js         the same as GeoJSON for the page (lot outlines), plus the hot cells
  index.html      the map: marked buildings coloured by when the change appears, layers that can be switched,
                  the timeline photographs of a building on click
Open index.html in a browser (the photographs are read from ../views/).

Classes: taller, first seen by 2019 / 2020-2023 / 2024 on (the photograph before the change is from before the
April 2018 flight -> flagged "may predate 2018"; both photographs before it -> "before 2018", not a 2018-2025 change),
new building, no change, unclear, no photographs.

Run: uv run python scripts/stage8_map.py
"""
import glob
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data/interim/stage8"
OUT = D / "map"
NAME = json.loads((ROOT / "results/citywide/stage8/FROZEN").read_text())["name"]
FT = 0.3048006096
FLIGHT = "2018-04"


def classify(r):
    if r.status != "ok":
        return "nophoto", None, None
    if pd.isna(r.verdict):
        return "pending", None, None
    if r.verdict != "taller":
        return {"new_building": "new", "no_change": "same"}.get(r.verdict, "unclear"), None, None
    if pd.isna(r.first_after):
        return "unclear", None, None
    b = int(r.first_after)
    a = int(r.last_before) if not pd.isna(r.last_before) else b - 1
    if not (1 <= a < b <= len(r.dates)):
        return "unclear", None, None
    t0, t1 = r.dates[a - 1], r.dates[b - 1]
    if t1 <= FLIGHT:
        return "before2018", t0, t1
    return ("t1" if t1 <= "2019-12" else "t2" if t1 <= "2023-12" else "t3"), t0, t1


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    cand = pd.read_parquet(D / "candidates.parquet")
    rows, geo = [], []
    for fp in sorted(glob.glob(str(D / "photos" / "1*.jsonl"))):
        z = Path(fp).stem
        ph = pd.DataFrame([json.loads(line) for line in open(fp)])[["unit", "status", "photos"]]
        fj = D / "judge" / f"{z}_{NAME}.jsonl"
        jd = pd.DataFrame([json.loads(line) for line in open(fj)]) if fj.exists() and fj.stat().st_size else pd.DataFrame(
            columns=["unit", "dates", "slots", "verdict", "last_before", "first_after", "reason"])
        x = cand[cand.zip == z].merge(ph, on="unit").merge(
            jd[["unit", "dates", "slots", "verdict", "last_before", "first_after", "reason"]], on="unit", how="left")
        if not len(x):
            continue
        u = gpd.read_parquet(ROOT / f"data/interim/citywide_units/{z}.parquet")[["unit", "address", "geometry"]]
        x = gpd.GeoDataFrame(x.merge(u, on="unit"), geometry="geometry", crs=2272).to_crs(4326)
        c = x.apply(classify, axis=1, result_type="expand")
        x["cls"], x["t0"], x["t1"] = c[0], c[1], c[2]
        x["maybe_before"] = x.t0.notna() & (x.t0 < FLIGHT) & x.cls.isin(["t1", "t2", "t3"])
        x["src"] = [("upward permit" if r.upward else "model score" if r.model else "zoning permit") for r in x.itertuples()]
        rows.append(pd.DataFrame(x.drop(columns=["geometry", "photos"])))
        for r in x.itertuples():
            used = set(r.slots) if isinstance(r.slots, list) else None
            photos = [{"d": p["date"], "f": f"{z}/{p['file']}"} for p in (r.photos or []) if used is None or p["slot"] in used]
            geo.append({"type": "Feature", "geometry": json.loads(gpd.GeoSeries([r.geometry.simplify(0.000003)]).to_json())["features"][0]["geometry"],
                        "properties": {"id": f"{z}_{r.unit}", "zip": z, "addr": r.address, "cls": r.cls, "t0": r.t0, "t1": r.t1,
                                       "mb": bool(r.maybe_before), "src": r.src, "hot": bool(r.hot),
                                       "why": r.reason if isinstance(r.reason, str) else "", "ph": photos}})
    t = pd.concat(rows, ignore_index=True)
    t[["zip", "unit", "address", "cls", "t0", "t1", "maybe_before", "src", "tier", "hot", "verdict", "reason"]].to_csv(OUT / "buildings.csv", index=False)

    hot = pd.read_csv(ROOT / "results/citywide/stage8/hot_cells.csv")
    s = 250 / FT
    hc = gpd.GeoSeries([box(int(c.split("_")[0]) * s, int(c.split("_")[1]) * s, (int(c.split("_")[0]) + 1) * s, (int(c.split("_")[1]) + 1) * s)
                        for c in hot.cell], crs=2272).to_crs(4326)
    data = {"buildings": {"type": "FeatureCollection", "features": geo},
            "hot": json.loads(hc.to_json()), "made": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
            "zips": sorted(t.zip.unique().tolist())}
    (OUT / "data.js").write_text("const DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    (OUT / "index.html").write_text(HTML)
    marked = t[t.cls.isin(["t1", "t2", "t3"])]
    print(f"ZIP codes {t.zip.nunique()}; candidates {len(t)}; classes {t.cls.value_counts().to_dict()}")
    print(f"marked taller 2018-2025: {len(marked)} (may predate the 2018 flight: {int(marked.maybe_before.sum())}); "
          f"in hot cells {int(marked.hot.sum())}; by source {marked.src.value_counts().to_dict()}")
    print(f"written: {OUT}/index.html, data.js ({(OUT / 'data.js').stat().st_size / 1e6:.1f} MB), buildings.csv")


HTML = r"""<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>街景确认的加层 · 本地地图</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css">
<style>
:root{--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--line:#d9d7d0;
  --t1:#f6b26b;--t2:#e8702a;--t3:#a5360a;--new:#2a78d6;--same:#9a9890;--edge:#4a2408}
*{box-sizing:border-box} html,body{margin:0;height:100%;font:14px/1.45 system-ui,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--surface)}
#map{position:absolute;inset:0}
#panel{position:absolute;top:12px;left:12px;width:292px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:12px 14px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
#panel h1{font-size:15px;margin:0 0 2px} #panel p{margin:0 0 10px;color:var(--ink2);font-size:12px}
.row{display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;user-select:none}
.row input{margin:0} .sw{width:16px;height:12px;border-radius:2px;border:1px solid var(--edge);flex:none}
.row .n{margin-left:auto;color:var(--ink2);font-variant-numeric:tabular-nums}
.grp{font-size:12px;color:var(--ink2);margin:8px 0 2px}
#info{position:absolute;right:12px;top:12px;bottom:12px;width:min(640px,48vw);background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 16px;overflow:auto;display:none;box-shadow:0 2px 10px rgba(0,0,0,.08)}
#info h2{font-size:16px;margin:0 28px 4px 0} #info .meta{color:var(--ink2);font-size:13px;margin-bottom:8px}
#info .why{font-size:13px;margin:6px 0 10px;padding:8px 10px;background:#f1efe9;border-radius:6px}
#info .ph{display:grid;grid-template-columns:1fr 1fr;gap:8px} #info figure{margin:0} #info img{width:100%;display:block;border-radius:4px;border:1px solid var(--line)}
#info figcaption{font-size:12px;color:var(--ink2);padding:3px 1px}
#info .mark{color:var(--ink);font-weight:600}
#close{position:absolute;right:10px;top:8px;border:0;background:none;font-size:20px;cursor:pointer;color:var(--ink2)}
.tag{display:inline-block;padding:1px 7px;border-radius:10px;border:1px solid var(--line);font-size:12px;margin-right:4px}
</style>
</head>
<body>
<div id="map"></div>
<div id="panel">
  <h1>街景确认的加层</h1>
  <p id="sub"></p>
  <div class="grp">变高了，变化最早出现在</div>
  <label class="row"><input type="checkbox" data-c="t1" checked><span class="sw" style="background:var(--t1)"></span>2018–2019 年的照片<span class="n" id="n-t1"></span></label>
  <label class="row"><input type="checkbox" data-c="t2" checked><span class="sw" style="background:var(--t2)"></span>2020–2023 年的照片<span class="n" id="n-t2"></span></label>
  <label class="row"><input type="checkbox" data-c="t3" checked><span class="sw" style="background:var(--t3)"></span>2024 年以后的照片<span class="n" id="n-t3"></span></label>
  <label class="row"><input type="checkbox" id="mb" checked><span class="sw" style="background:repeating-linear-gradient(45deg,#fff,#fff 2px,var(--t2) 2px,var(--t2) 4px)"></span>其中：可能早于 2018 年 4 月<span class="n" id="n-mb"></span></label>
  <div class="grp">其他判断</div>
  <label class="row"><input type="checkbox" data-c="new"><span class="sw" style="background:var(--new);border-color:#174a86"></span>空地上新建<span class="n" id="n-new"></span></label>
  <label class="row"><input type="checkbox" data-c="before2018"><span class="sw" style="background:#d8c9a8;border-color:#7a6a45"></span>2018 年之前就变高了<span class="n" id="n-before2018"></span></label>
  <label class="row"><input type="checkbox" data-c="same"><span class="sw" style="background:var(--same);border-color:#5d5b55"></span>看过，没变<span class="n" id="n-same"></span></label>
  <label class="row"><input type="checkbox" data-c="unclear"><span class="sw" style="background:#fff;border-color:#5d5b55"></span>看不清<span class="n" id="n-unclear"></span></label>
  <label class="row"><input type="checkbox" data-c="nophoto"><span class="sw" style="background:#fff;border:1px dashed #5d5b55"></span>没有前后照片<span class="n" id="n-nophoto"></span></label>
  <div class="grp">范围</div>
  <label class="row"><input type="checkbox" id="hot" checked><span class="sw" style="background:none;border:1.5px solid #6b6a64"></span>热点格子（航拍模型判为长高 ≥ 3 栋）</label>
</div>
<div id="info"><button id="close" aria-label="关闭">×</button><div id="body"></div></div>
<script src="https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js"></script>
<script src="data.js"></script>
<script>
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const F = DATA.buildings.features, CLS = ["t1","t2","t3","new","before2018","same","unclear","nophoto","pending"];
const count = Object.fromEntries(CLS.map(c => [c, F.filter(f => f.properties.cls === c).length]));
for (const c of CLS) { const el = document.getElementById("n-" + c); if (el) el.textContent = count[c].toLocaleString(); }
document.getElementById("n-mb").textContent = F.filter(f => f.properties.mb).length.toLocaleString();
document.getElementById("sub").textContent = `${(count.t1 + count.t2 + count.t3).toLocaleString()} 栋判为变高 · ${DATA.zips.length} 个 ZIP · 生成于 ${DATA.made}。点击任意一栋看街景时间线。`;
const NAME = {t1:"变高，最早见于 2018–2019 年的照片", t2:"变高，最早见于 2020–2023 年的照片", t3:"变高，最早见于 2024 年以后的照片", new:"空地上新建",
  before2018:"2018 年之前就变高了", same:"看过，没变", unclear:"看不清", nophoto:"没有前后照片", pending:"尚未判断"};
const SRC = {"upward permit":"向上加建许可", "model score":"航拍模型分数", "zoning permit":"分区许可"};
const map = new maplibregl.Map({container:"map", style:"https://tiles.openfreemap.org/styles/positron", center:[-75.17,39.955], zoom:12.2});
map.addControl(new maplibregl.NavigationControl({showCompass:false}), "bottom-right");
map.on("load", () => {
  map.addSource("hot", {type:"geojson", data:DATA.hot});
  map.addLayer({id:"hot", type:"line", source:"hot", paint:{"line-color":"#6b6a64","line-width":1,"line-opacity":0.55}});
  map.addSource("b", {type:"geojson", data:DATA.buildings, promoteId:"id"});
  const fill = ["match", ["get","cls"], "t1",css("--t1"), "t2",css("--t2"), "t3",css("--t3"), "new",css("--new"), "before2018","#d8c9a8", "same",css("--same"), "#ffffff"];
  const edge = ["match", ["get","cls"], "new","#174a86", "before2018","#7a6a45", "same","#5d5b55", "unclear","#5d5b55", "nophoto","#5d5b55", css("--edge")];
  map.addLayer({id:"b-fill", type:"fill", source:"b", paint:{"fill-color":fill, "fill-opacity":["case", ["get","mb"], 0.45, ["in", ["get","cls"], ["literal",["same","unclear","nophoto"]]], 0.5, 0.95]}});
  const lw = ["interpolate",["linear"],["zoom"],12,0.6,16,1.6];
  map.addLayer({id:"b-line", type:"line", source:"b", paint:{"line-color":edge, "line-width":lw}});
  map.addLayer({id:"b-dash", type:"line", source:"b", paint:{"line-color":edge, "line-width":lw, "line-dasharray":[2,1.5]}});
  // at city scale a lot is a few pixels: a dot per marked building keeps them visible
  map.addLayer({id:"b-dot", type:"circle", source:"b", maxzoom:14.5, filter:["in", ["get","cls"], ["literal",["t1","t2","t3"]]],
    paint:{"circle-radius":["interpolate",["linear"],["zoom"],11,2.2,14.5,4.5], "circle-color":fill, "circle-stroke-color":"#fcfcfb", "circle-stroke-width":1, "circle-opacity":["case",["get","mb"],0.55,1]}});
  map.addLayer({id:"b-sel", type:"line", source:"b", filter:["==",["get","id"],""], paint:{"line-color":"#0b0b0b","line-width":3}});
  apply();
  for (const l of ["b-fill","b-dot"]) {
    map.on("click", l, e => show(e.features[0].properties));
    map.on("mouseenter", l, () => map.getCanvas().style.cursor = "pointer");
    map.on("mouseleave", l, () => map.getCanvas().style.cursor = "");
  }
});
function apply() {
  const on = [...document.querySelectorAll("input[data-c]")].filter(i => i.checked).map(i => i.dataset.c);
  let f = ["in", ["get","cls"], ["literal", on]];
  if (!document.getElementById("mb").checked) f = ["all", f, ["!", ["get","mb"]]];
  const dashed = ["any", ["get","mb"], ["==", ["get","cls"], "nophoto"]];
  map.setFilter("b-fill", f); map.setFilter("b-line", ["all", f, ["!", dashed]]); map.setFilter("b-dash", ["all", f, dashed]);
  map.setFilter("b-dot", ["all", f, ["in", ["get","cls"], ["literal",["t1","t2","t3"]]]]);
  map.setLayoutProperty("hot", "visibility", document.getElementById("hot").checked ? "visible" : "none");
}
document.getElementById("panel").addEventListener("change", apply);
function show(p) {
  const ph = typeof p.ph === "string" ? JSON.parse(p.ph) : p.ph;
  map.setFilter("b-sel", ["==", ["get","id"], p.id]);
  const when = p.t1 && p.t1 !== "null" ? `<div class="meta">变化出现在 <b>${p.t0}</b> 和 <b>${p.t1}</b> 两张照片之间${p.mb === true || p.mb === "true" ? "（前一张早于 2018 年 4 月的 LiDAR 飞行，可能发生在那之前）" : ""}</div>` : "";
  document.getElementById("body").innerHTML = `<h2>${p.addr || "(无地址)"}</h2>
    <div class="meta"><span class="tag">${p.zip}</span><span class="tag">${NAME[p.cls]}</span><span class="tag">候选来源：${SRC[p.src] || p.src}</span></div>${when}
    ${p.why ? `<div class="why">Gemini：${p.why}</div>` : ""}
    <div class="ph">${ph.map(x => `<figure><img loading="lazy" src="../views/${x.f}" alt="街景 ${x.d}"><figcaption class="${p.t1 === x.d ? "mark" : ""}">${x.d}${p.t1 === x.d ? " ← 第一张看到变高" : p.t0 === x.d ? " ← 最后一张还没变" : ""}</figcaption></figure>`).join("")}</div>${ph.length ? "" : "<p>这栋没有可用的照片。</p>"}`;
  document.getElementById("info").style.display = "block";
}
document.getElementById("close").onclick = () => { document.getElementById("info").style.display = "none"; map.setFilter("b-sel", ["==",["get","id"],""]); };
</script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
