// Acts 4-5: the sealed test and what the city looks like. All data aggregated (cells, years, permits).
import * as d3 from "d3";
import "d3-transition";   // registers selection.transition(); d3 is marked side-effect free, so the bundler would drop it
import { v } from "./data.js";

const DATA = "/data";
const INK = "#1b2a3a", INK2 = "#4c5966", RULE = "#d6d0c4", SIGNAL = "#ff5a1f", PAPER = "#f1eee8";
const cache = {};
const get = async (f) => (cache[f] ??= await (await fetch(v(`${DATA}/results/${f}`))).json());
const base = (div) => d3.select(div).append("svg").attr("viewBox", "0 0 1000 1000");

// sealed test: model vs LiDAR new construction per 250 m cell. Most blocks have no new building in either and are
// left out (counted in a note); square-root axes spread the small counts; identical points become one bubble whose
// area is the number of blocks.
export async function scatter(div) {
  const d = await get("test_cells.json"), svg = base(div);
  const m = { l: 130, r: 60, t: 110, b: 130 }, W = 1000 - m.l - m.r, H = 1000 - m.t - m.b;
  const shown = d.cells.filter((c) => c.lidar > 0 || c.model > 0);
  const bins = d3.rollups(shown, (v) => v.length, (c) => c.lidar, (c) => Math.round(c.model * 2) / 2)
    .flatMap(([lx, ys]) => ys.map(([my, n]) => ({ lidar: lx, model: my, n })));
  const max = Math.ceil(d3.max(shown, (c) => Math.max(c.lidar, c.model)));
  // a small inset keeps the zero row and column off the axes, so bubbles never cover the tick labels
  const x = d3.scaleSqrt([0, max], [44, W]), y = d3.scaleSqrt([0, max], [H - 44, 0]);
  const r = d3.scaleSqrt([1, d3.max(bins, (v) => v.n)], [7, 30]);
  const ticks = [0, 1, 2, 5, 10, 20].filter((v) => v <= max);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
  g.append("line").attr("x1", x(0)).attr("y1", y(0)).attr("x2", x(max)).attr("y2", y(max))
    .attr("stroke", RULE).attr("stroke-width", 3).attr("stroke-dasharray", "10 8");
  g.append("g").attr("transform", `translate(0,${H})`).attr("class", "c-axis").call(d3.axisBottom(x).tickValues(ticks).tickFormat(d3.format("d")).tickSizeOuter(0));
  g.append("g").attr("class", "c-axis").call(d3.axisLeft(y).tickValues(ticks).tickFormat((v) => (v ? d3.format("d")(v) : "")).tickSizeOuter(0));
  svg.append("text").attr("x", m.l + W / 2).attr("y", 990).attr("text-anchor", "middle").attr("class", "c-note")
    .text("new buildings per block, measured by LiDAR");
  svg.append("text").attr("transform", `translate(40 ${m.t + H / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("class", "c-note")
    .text("new buildings per block, read by the model");
  g.selectAll("circle.b").data(bins.sort((p, q) => q.n - p.n)).join("circle").attr("class", "b")
    .attr("cx", (v) => x(v.lidar)).attr("cy", (v) => y(v.model)).attr("r", 0)
    .attr("fill", SIGNAL).attr("fill-opacity", 0.55).attr("stroke", SIGNAL).attr("stroke-width", 2)
    .transition().delay((v, k) => 200 + k * 10).duration(600).attr("r", (v) => r(v.n));
  // the many blocks with no new building in either: one quiet dashed circle on the corner where the axes meet
  g.append("circle").attr("cx", 0).attr("cy", H).attr("r", 30).attr("fill", "#e1dcd2").attr("fill-opacity", 0.85)
    .attr("stroke", INK2).attr("stroke-width", 2).attr("stroke-dasharray", "6 6");
  g.append("text").attr("x", 0).attr("y", H + 8).attr("text-anchor", "middle").attr("class", "c-note")
    .style("fill", "#8f897d").style("font-size", "21px").text(d.cells.length - shown.length);
}

// what a photograph cannot show: five lots as CSS 3D blocks. The same blocks serve two screens: seen from directly
// above, and tilted to the side (#chart.side). The extra storey keeps a grey roof, so from above it looks unchanged;
// its walls are orange, so from the side it is obvious. Every object is a closed box (no open faces to show edge-on).
export function iso(div) {
  const lots = [{ s: 2 }, { s: 3, isNew: true }, { s: 2 }, { s: 3, extra: true }, { s: 2 }];
  const W = 84, D = 170, H = 46, G = 8, L = 5 * W + 4 * G, SW = 34, ST = 92;
  const face = (cls, style) => `<div class="f ${cls}" style="${style}"></div>`;
  // closed box at (x, y, z) of size w x d x h; c.top / c.wall pick the colours, c.top "none" leaves the lid off
  const box = (x, y, z, w, d, h, c) => `<div class="cub" style="transform:translate3d(${x}px,${y}px,${z}px)">` +
    (c.top === "none" ? "" : face(`top ${c.top}`, `width:${w}px;height:${d}px;transform:translateZ(${h}px)`)) +
    face(`front ${c.wall}`, `width:${w}px;height:${h}px;top:${d}px;transform-origin:0 0;transform:rotateX(90deg)`) +
    face(`front ${c.wall}`, `width:${w}px;height:${h}px;top:0;transform-origin:0 0;transform:rotateX(90deg)`) +
    face(`side ${c.wall}`, `width:${h}px;height:${d}px;left:${w}px;transform-origin:0 0;transform:rotateY(-90deg)`) +
    face(`side ${c.wall}`, `width:${h}px;height:${d}px;left:0;transform-origin:0 0;transform:rotateY(-90deg)`) + `</div>`;
  let html = "";
  lots.forEach((l, i) => {
    html += `<div class="shade" style="left:${i * (W + G) - 6}px;top:-4px;width:${W + 14}px;height:${D + 14}px"></div>`;
    for (let k = 0; k < l.s; k++) {
      const top = k === l.s - 1, changed = l.isNew || (l.extra && top);
      html += box(i * (W + G), 0, k * H, W, D, H, { top: top ? (l.isNew ? "new" : "roof") : "none", wall: changed ? "new" : "old" });
    }
  });
  // in front of the houses: sidewalk, street and centre line, lifted 1 px so they never fight the ground plane
  const flat = (cls, y, h) => `<div class="flat ${cls}" style="left:-40px;top:${y}px;width:${L + 80}px;height:${h}px"></div>`;
  html += flat("walk", D, SW) + flat("street", D + SW, ST) + flat("centre", D + SW + ST / 2 - 2, 4);
  // street trees: a closed trunk and a closed crown, in the same blocky style as the houses
  for (const k of [0.5, 2.5, 4.5]) {
    const x = k * (W + G) + W / 2, y = D + SW / 2;
    html += box(x - 4, y - 4, 1, 8, 8, 44, { top: "trunk", wall: "trunk" });
    // crown: a shaded disc that always turns to face the camera (a billboard), so it reads as a ball from any angle
    html += `<div class="cub" style="transform:translate3d(${x}px,${y}px,${44 + 20}px)"><div class="ball"></div></div>`;
    html += `<div class="shade round" style="left:${x - 26}px;top:${y - 26}px;width:52px;height:52px"></div>`;
  }
  div.innerHTML = `<div class="iso-wrap"><div class="iso-scene" style="width:${L}px;height:${D + SW + ST}px">
    <div class="iso-ground" style="height:${D + 40}px"></div>${html}</div></div>`;
  // the scene is drawn in pixels (CSS 3D), so its scale follows the chart area like the SVG charts do
  const fit = () => {
    const r = div.getBoundingClientRect();
    if (r.width && r.height) div.style.setProperty("--iso-k", Math.min(r.width / 620, r.height / 520).toFixed(3));
  };
  fit();
  isoObserver ||= new ResizeObserver(fit);
  isoObserver.disconnect();
  isoObserver.observe(div);
}
let isoObserver = null;

// new construction per year on one fixed set of units; model-only years in orange
export async function yearly(div) {
  const d = await get("yearly.json"), svg = base(div);
  const m = { l: 110, r: 50, t: 120, b: 130 }, W = 1000 - m.l - m.r, H = 1000 - m.t - m.b;
  const x = d3.scaleBand(d.years.map((v) => v.label), [0, W]).padding(0.28), y = d3.scaleLinear([0, 2.6], [H, 0]);
  const g = svg.append("g").attr("transform", `translate(${m.l},${m.t})`);
  g.append("g").attr("class", "c-axis").call(d3.axisLeft(y).ticks(5));
  g.append("g").attr("transform", `translate(0,${H})`).attr("class", "c-axis c-axis-big").call(d3.axisBottom(x).tickSize(0).tickPadding(18));
  svg.append("text").attr("x", 60).attr("y", 70).attr("class", "c-note").text("new buildings per 1,000 lots per year");
  g.selectAll("rect").data(d.years).join("rect").attr("x", (v) => x(v.label)).attr("width", x.bandwidth())
    .attr("y", H).attr("height", 0).attr("fill", (v) => (v.model ? SIGNAL : INK))
    .transition().delay((v, k) => 120 * k).duration(800).attr("y", (v) => y(v.rate)).attr("height", (v) => H - y(v.rate));
  g.selectAll("text.v").data(d.years).join("text").attr("class", "c-label v").attr("text-anchor", "middle")
    .attr("x", (v) => x(v.label) + x.bandwidth() / 2).attr("y", (v) => y(v.rate) - 16).text((v) => v.rate.toFixed(1))
    .attr("opacity", 0).transition().delay((v, k) => 120 * k + 800).duration(400).attr("opacity", 1);   // after the bar
  const leg = [[SIGNAL, "from photographs"], [INK, "from LiDAR"]];
  leg.forEach(([c, t], k) => {
    svg.append("rect").attr("x", 690).attr("y", 50 + k * 44).attr("width", 26).attr("height", 26).attr("fill", c);
    svg.append("text").attr("x", 730).attr("y", 72 + k * 44).attr("class", "c-note").text(t);
  });
}

// the city: every 250 m block with new construction 2018-2025 stands as a column, as tall as its number of new
// buildings; the city is seen from the south at an angle. One drawing serves two screens: #chart.rail dims the columns
// a little and brings in the rail stops (dark dots on the ground), so nothing else moves.
export async function cityMap(div) {
  const [cells, zips, stops] = await Promise.all([get("cells.geojson"),
    (cache.zips ??= await (await fetch(v(`${DATA}/model/zips.geojson`))).json()), get("rail.json")]);
  const svg = base(div);
  const flat = d3.geoMercator().fitExtent([[40, 0], [960, 1000]], zips);
  const TILT = 0.62, Y0 = 330, K = 4.6;                    // ground squash, top margin, pixels per new building
  const P = (c) => { const [x, y] = flat(c); return [x, Y0 + (y - 500) * TILT + 190]; };
  const path = d3.geoPath(d3.geoTransform({ point(x, y) { const q = P([x, y]); this.stream.point(q[0], q[1]); } }));
  svg.append("g").selectAll("path").data(zips.features).join("path").attr("d", path).attr("fill", "#e7e2d8").attr("stroke", PAPER).attr("stroke-width", 2);
  svg.append("g").attr("class", "stations").selectAll("circle").data(stops).join("circle")
    .attr("cx", (p) => P(p)[0]).attr("cy", (p) => P(p)[1]).attr("r", 3.6).attr("fill", "#3d4650");
  // columns, drawn from the north (back) to the south (front) so that nearer ones cover farther ones
  const built = cells.features.filter((f) => f.properties.n > 0).map((f) => {
    const r = f.geometry.coordinates[0].slice(0, 4).map(P), xs = r.map((q) => q[0]), ys = r.map((q) => q[1]);
    return { n: f.properties.n, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }).sort((p, q) => p.y1 - q.y1);
  const cap = 60, h = (c) => Math.min(c.n, cap) * K;
  const col = d3.scaleSequential([0, 40], d3.interpolateRgb("#ff9a66", "#d9400f")).clamp(true);
  const g = svg.append("g").attr("class", "cells").selectAll("g").data(built).join("g");
  const front = g.append("rect").attr("x", (c) => c.x0).attr("width", (c) => c.x1 - c.x0).attr("y", (c) => c.y1).attr("height", 0)
    .attr("fill", (c) => d3.rgb(col(c.n)).darker(0.7));
  const top = g.append("rect").attr("x", (c) => c.x0).attr("width", (c) => c.x1 - c.x0).attr("y", (c) => c.y0)
    .attr("height", (c) => c.y1 - c.y0).attr("fill", (c) => col(c.n));
  const T = (sel) => sel.transition().delay((c, k) => 250 + k * 2.2).duration(900).ease(d3.easeCubicOut);
  T(front).attr("y", (c) => c.y1 - h(c)).attr("height", (c) => h(c));
  T(top).attr("y", (c) => c.y0 - h(c));
  // key: one column of 20 new buildings, and the rail stop (shown with the stops)
  const lg = svg.append("g").attr("transform", "translate(660,900)");
  lg.append("rect").attr("x", 0).attr("y", -20 * K).attr("width", 16).attr("height", 20 * K).attr("fill", d3.rgb(col(20)).darker(0.7));
  lg.append("rect").attr("x", 0).attr("y", -20 * K - 10).attr("width", 16).attr("height", 10).attr("fill", col(20));
  lg.append("text").attr("class", "c-note").attr("x", 30).attr("y", -40).text("20 new buildings");
  lg.append("text").attr("class", "c-note").attr("x", 30).attr("y", -10).text("in a 250 m block");
  const rk = lg.append("g").attr("class", "stations").attr("transform", "translate(0,44)");
  rk.append("circle").attr("cx", 8).attr("cy", -8).attr("r", 6).attr("fill", "#3d4650");
  rk.append("text").attr("class", "c-note").attr("x", 30).text("rail stop");
}

// who: new buildings and added storeys per 1,000 lots per year by block-group income quintile (2015-19). The two kinds
// of growth peak at opposite ends: the peak of each panel is orange.
export async function income(div) {
  const d = await get("income.json"), svg = base(div);
  const panels = [["level", "new buildings", 0], ["popup_level", "added storeys", 4]];
  const y = d3.scaleLinear([0, 2.6], [820, 260]);
  panels.forEach(([k, title, hot], p) => {
    const x0 = 70 + p * 470, x = d3.scaleBand(d3.range(5), [x0, x0 + 400]).padding(0.25);
    svg.append("text").attr("x", x0).attr("y", 200).attr("class", "c-label").text(title);
    d[k].forEach((val, q) => {
      svg.append("rect").attr("x", x(q)).attr("width", x.bandwidth()).attr("y", 820).attr("height", 0)
        .attr("fill", q === hot ? SIGNAL : "#a7b0ba").transition().delay(100 * q + 300 * p).duration(700)
        .attr("y", y(val)).attr("height", 820 - y(val));
      svg.append("text").attr("x", x(q) + x.bandwidth() / 2).attr("y", y(val) - 14).attr("text-anchor", "middle")
        .attr("class", "c-label").style("font-size", "26px").attr("opacity", 0).text(val.toFixed(1))
        .transition().delay(100 * q + 300 * p + 700).duration(300).attr("opacity", 1);
    });
    svg.append("line").attr("x1", x0).attr("x2", x0 + 400).attr("y1", 820).attr("y2", 820).attr("stroke", INK2).attr("stroke-width", 2);
    svg.append("text").attr("x", x0).attr("y", 862).attr("class", "c-note").text("lowest income");
    svg.append("text").attr("x", x0 + 400).attr("y", 862).attr("text-anchor", "end").attr("class", "c-note").text("highest");
  });
  svg.append("text").attr("x", 70).attr("y", 120).attr("class", "c-note").text("per 1,000 lots per year, neighbourhoods in fifths by income");
}

// what kind of street: new construction per 1,000 lots per year by area type, the two LiDAR periods side by side
export async function areaType(div) {
  const d = await get("area_type.json"), svg = base(div);
  const x = d3.scaleBand(d.map((r) => r.type), [90, 950]).padding(0.3), y = d3.scaleLinear([0, 2.8], [820, 220]);
  const sub = d3.scaleBand([0, 1], [0, x.bandwidth()]).padding(0.08), col = [INK, "#a7b0ba"];   // both periods are LiDAR: ink family (orange is kept for the model and for highlights)
  svg.append("text").attr("x", 90).attr("y", 120).attr("class", "c-note").text("new buildings per 1,000 lots per year");
  d.forEach((r, i) => {
    r.periods.forEach((p, j) => {
      const xx = x(r.type) + sub(j);
      svg.append("rect").attr("x", xx).attr("width", sub.bandwidth()).attr("y", 820).attr("height", 0).attr("fill", col[j])
        .transition().delay(150 * i + 80 * j).duration(700).attr("y", y(p.rate)).attr("height", 820 - y(p.rate));
      svg.append("text").attr("x", xx + sub.bandwidth() / 2).attr("y", y(p.rate) - 14).attr("text-anchor", "middle")
        .attr("class", "c-label").style("font-size", "26px").attr("opacity", 0).text(p.rate.toFixed(1))
        .transition().delay(150 * i + 80 * j + 700).duration(300).attr("opacity", 1);
    });
    svg.append("text").attr("x", x(r.type) + x.bandwidth() / 2).attr("y", 870).attr("text-anchor", "middle")
      .attr("class", "c-label").text(r.type);
  });
  svg.append("line").attr("x1", 90).attr("x2", 950).attr("y1", 820).attr("y2", 820).attr("stroke", INK2).attr("stroke-width", 2);
  d[0].periods.forEach((p, j) => {
    svg.append("rect").attr("x", 520 + j * 220).attr("y", 98).attr("width", 26).attr("height", 26).attr("fill", col[j]);
    svg.append("text").attr("x", 556 + j * 220).attr("y", 120).attr("class", "c-note").text(p.period);
  });
}

// 100 permits: how many became visible buildings by 2025
// Below them, the new buildings LiDAR saw with no matching permit, at the same scale: 175 of 3,600 detected new
// buildings 2018-2025 (4.9%, results/citywide/stage7/rq3_summary.json), i.e. about 3 for these 61 (61 x 4.9 / 95.1).
export function waffle(div, { share = 61, noPermit = 3 } = {}) {
  const svg = base(div), n = 10, s = 62, gap = 10, x0 = (1000 - n * s - (n - 1) * gap) / 2, y0 = 130;
  svg.append("text").attr("x", x0).attr("y", 95).attr("class", "c-note").text("100 new-construction permits, issued 2018–2020");
  d3.range(100).forEach((k) => {
    const i = k % n, j = Math.floor(k / n), on = k < share;
    svg.append("rect").attr("x", x0 + i * (s + gap)).attr("y", y0 + j * (s + gap)).attr("width", s).attr("height", s)
      .attr("fill", on ? SIGNAL : "#e7e2d8").attr("opacity", 0).transition().delay(on ? 15 * k : 900).duration(400).attr("opacity", 1);
  });
  const y1 = y0 + n * (s + gap) + 34;
  d3.range(noPermit).forEach((k) => {
    const g = svg.append("g").attr("transform", `translate(${x0 + k * (s + gap)},${y1})`).attr("opacity", 0);
    g.append("rect").attr("width", s).attr("height", s).attr("fill", SIGNAL);
    g.append("path").attr("d", `M14 14L${s - 14} ${s - 14}M${s - 14} 14L14 ${s - 14}`).attr("stroke", "#fff").attr("stroke-width", 7).attr("stroke-linecap", "round");
    g.transition().delay(1500 + 120 * k).duration(400).attr("opacity", 1);
  });
}

// from the street, drawn rather than photographed (no street-level photograph is published). One row of rowhouses:
// with `timeline` the same row in three years, the target under a small marker, its added storey in orange.
export function street(div, timeline) {
  const svg = base(div), W = 150, G = 8, SH = 56, x0 = (1000 - 5 * W - 4 * G) / 2;
  const row = (g, storeys, target, grown) => {
    storeys.forEach((n, i) => {
      const x = i * (W + G), isT = i === target;
      for (let k = 0; k < n; k++) {
        const added = isT && grown && k === n - 1, y = -(k + 1) * SH;
        const wall = g.append("rect").attr("x", x).attr("width", W).attr("y", y).attr("height", SH)
          .attr("fill", added ? "#ff7a45" : "#a7b0ba").attr("stroke", added ? "#d9481a" : "#7b8693").attr("stroke-width", 2);
        const wins = [0.2, 0.62].map((f) => g.append("rect").attr("x", x + f * W).attr("y", y + 14).attr("width", W * 0.18)
          .attr("height", SH - 26).attr("fill", added ? "#ffe3d6" : "#e3e7eb"));
        if (k === 0) g.append("rect").attr("x", x + 0.62 * W).attr("y", y + 12).attr("width", W * 0.18).attr("height", SH - 12).attr("fill", INK2);
        if (added) for (const e of [wall, ...wins]) e.attr("opacity", 0).transition().delay(1500).duration(700).attr("opacity", 1);
      }
      g.append("rect").attr("x", x - 3).attr("width", W + 6).attr("y", -n * SH - 8).attr("height", 8)
        .attr("fill", isT && grown ? "#d9481a" : "#7b8693")
        .attr("opacity", isT && grown ? 0 : 1).transition().delay(1500).duration(700).attr("opacity", 1);
    });
    g.append("rect").attr("x", -60).attr("width", 5 * W + 4 * G + 120).attr("y", 0).attr("height", 10).attr("fill", RULE);
  };
  if (!timeline) {
    // one large row with the street in front of it
    const k = 1.18, w = 5 * W + 4 * G;
    const g = svg.append("g").attr("transform", `translate(${(1000 - w * k) / 2},600) scale(${k})`);
    g.append("rect").attr("x", -60).attr("width", w + 120).attr("y", 10).attr("height", 22).attr("fill", "#e1dcd2");
    g.append("rect").attr("x", -60).attr("width", w + 120).attr("y", 32).attr("height", 64).attr("fill", "#7b8693");
    g.append("line").attr("x1", -60).attr("x2", w + 60).attr("y1", 64).attr("y2", 64).attr("stroke", "#fff")
      .attr("stroke-width", 3).attr("stroke-dasharray", "22 16");
    row(g, [2, 3, 2, 3, 2], -1, false);
    return;
  }
  const years = ["2017", "2019", "2025"], base0 = [2, 3, 2, 2, 3];
  years.forEach((yr, k) => {
    const g = svg.append("g").attr("transform", `translate(${x0},${290 + k * 300})`).attr("opacity", 0);
    const grown = k === 2;
    row(g, grown ? [2, 3, 3, 2, 3] : base0, 2, grown);
    g.append("text").attr("x", -60).attr("y", -3 * SH - 26).attr("class", "c-label").text(yr);
    g.append("path").attr("d", `M${2 * (W + G) + W / 2 - 12} ${-3 * SH - 44}h24l-12 18z`).attr("fill", SIGNAL);
    g.transition().delay(350 * k).duration(600).attr("opacity", 1);
  });
}

// the houses seen taller from the street, 2018-2025: one dot per house, on the part of the city where they are.
// Three colours for the photographs in which the change first shows (validated as a set for colour-blind readers);
// the dots arrive period by period and the count of each fills in under its label.
const PERIOD = ["#2a78d6", "#1baf7a", "#eb6834"];
export async function streetMap(div) {
  const [d, zips] = await Promise.all([get("street.json"), (cache.zips ??= await (await fetch(v(`${DATA}/model/zips.geojson`))).json())]);
  const svg = base(div);
  const pts = { type: "MultiPoint", coordinates: d.points.map((p) => [p[0], p[1]]) };
  const proj = d3.geoMercator().fitExtent([[60, 150], [940, 940]], pts), path = d3.geoPath(proj);
  svg.append("g").selectAll("path").data(zips.features).join("path").attr("d", path).attr("fill", "#e7e2d8").attr("stroke", PAPER).attr("stroke-width", 3);
  const WAVE = 1300;
  svg.append("g").selectAll("circle").data(d.points).join("circle")
    .attr("cx", (p) => proj(p)[0]).attr("cy", (p) => proj(p)[1]).attr("r", 0).attr("fill", (p) => PERIOD[p[2]]).attr("fill-opacity", 0.9)
    .attr("stroke", PAPER).attr("stroke-width", 0.8)
    .transition().delay((p, k) => 300 + p[2] * WAVE + (k % 40) * 12).duration(450).attr("r", 5);
  d.periods.forEach((label, k) => {
    const g = svg.append("g").attr("transform", `translate(${60 + k * 300},70)`).attr("opacity", 0.25);
    g.append("circle").attr("cx", 9).attr("cy", -8).attr("r", 9).attr("fill", PERIOD[k]);
    g.append("text").attr("class", "c-note").attr("x", 28).text(`first seen ${label}`);
    const n = g.append("text").attr("class", "c-label").attr("x", 28).attr("y", 44).text("0");
    g.transition().delay(300 + k * WAVE).duration(400).attr("opacity", 1);
    n.transition().delay(300 + k * WAVE).duration(WAVE - 200).tween("text", () => {
      const f = d3.interpolateRound(0, d.by_period[k]);
      return (t) => n.text(f(t).toLocaleString("en-US"));
    });
  });
}
