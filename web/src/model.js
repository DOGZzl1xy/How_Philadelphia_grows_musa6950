// Visuals for the model act: ViT patch grid, the three-input stack, and the two charts.
import * as d3 from "d3";
import "d3-transition";   // registers selection.transition(); d3 is marked side-effect free, so the bundler would drop it
import { arch, data } from "./diagrams.js";
import { areaType, cityMap, income, iso, scatter, street, streetMap, waffle, yearly } from "./results.js";
import { v } from "./data.js";

const DATA = "/data";
const INK = "#1b2a3a", INK2 = "#4c5966", RULE = "#d6d0c4", SIGNAL = "#ff5a1f";

// ---------- patch grid: DINOv3 reads 16 x 16-pixel patches (4 m at 0.25 m) ----------
export function drawGrid(svg) {
  if (svg.childElementCount) return;
  const n = 64, s = 1024 / n, lines = [];
  for (let k = 1; k < n; k++) lines.push(`M${k * s} 0V1024`, `M0 ${k * s}H1024`);
  // a handful of patches light up, as if the model were reading them
  const rng = d3.randomLcg(7), cells = d3.range(36).map(() => [Math.floor(rng() * n), Math.floor(rng() * n)]);
  svg.innerHTML = `<path d="${lines.join("")}" stroke="rgba(255,255,255,.55)" stroke-width="1" fill="none"/>` +
    cells.map(([i, j], k) => `<rect class="tok" x="${i * s}" y="${j * s}" width="${s}" height="${s}"
      style="animation-delay:${(k * 0.08).toFixed(2)}s"/>`).join("");
}

// ---------- stack: photo (anchor year), LiDAR height (anchor year), photo (later year) ----------
export function drawStack(div, { scene, a, b, heightURL }) {
  const key = `${scene}_${a}_${b}`;
  if (div.dataset.key === key) return;
  div.dataset.key = key;
  const layers = [
    { src: v(`${DATA}/scenes/${scene}/photo_${b}.webp`), label: `Photograph, ${b}` },
    { src: heightURL, label: `LiDAR height, ${a}` },
    { src: v(`${DATA}/scenes/${scene}/photo_${a}.webp`), label: `Photograph, ${a}` },
  ];
  div.innerHTML = `<div class="stack-3d">${layers.map((l, k) =>
    `<div class="layer" style="--k:${2 - k}"><img src="${l.src}" alt=""></div>`).join("")}</div>
    <ol class="stack-legend">${layers.map((l) => `<li>${l.label}</li>`).join("")}</ol>`;
}

// ---------- charts ----------
const cache = {};
const json = async (f) => (cache[f] ??= await (await fetch(v(`${DATA}/model/${f}`))).json());

export async function drawChart(div, name, opts = {}) {
  if (div.dataset.name === name) return;
  div.dataset.name = name;
  div.innerHTML = "";
  if (name === "training") return training(div, await json("training.json"));
  if (name === "backbones") return backbones(div, await json("backbones.json"));
  if (name === "arch") return arch(div, opts);
  if (name === "data") return data(div, await json("zips.geojson"));
  if (name === "scatter") return scatter(div);
  if (name === "iso") return iso(div);
  if (name === "yearly") return yearly(div);
  if (name === "map") return cityMap(div);
  if (name === "waffle") return waffle(div);
  if (name === "income") return income(div);
  if (name === "area") return areaType(div);
  if (name === "street1") return street(div, false);
  if (name === "street") return street(div, true);
  if (name === "streetmap") return streetMap(div);
}

function frame(div, m = { t: 70, r: 40, b: 70, l: 70 }) {
  const W = 1000, H = 1000;
  const svg = d3.select(div).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
  return { svg, W, H, m, iw: W - m.l - m.r, ih: H - m.t - m.b, g: svg.append("g").attr("transform", `translate(${m.l},${m.t})`) };
}

function training(div, d) {
  const { svg, g, iw, ih, m } = frame(div);
  const x = d3.scaleLinear([0, 8000], [0, iw]), y = d3.scaleLinear([0, 1], [ih, 0]);
  g.append("rect").attr("width", x(d.frozen_until)).attr("height", ih).attr("fill", "#e7e2d8");
  g.append("text").attr("x", 14).attr("y", 30).attr("class", "c-note").text("DINOv3 frozen, decoder learns");
  g.append("text").attr("x", x(d.frozen_until) + 14).attr("y", 30).attr("class", "c-note").text("last 4 DINOv3 blocks fine-tuned");
  g.append("g").attr("transform", `translate(0,${ih})`).attr("class", "c-axis")
    .call(d3.axisBottom(x).ticks(8).tickFormat((v) => (v ? `${v / 1000}k` : "0")));
  g.append("g").attr("class", "c-axis").call(d3.axisLeft(y).ticks(5));
  svg.append("text").attr("x", m.l).attr("y", 40).attr("class", "c-title").text("Validation average precision, every 500 steps");
  svg.append("text").attr("x", m.l + iw).attr("y", 1000 - 18).attr("text-anchor", "end").attr("class", "c-note").text("training step");
  const line = d3.line().x((p) => x(p.step)).y((p) => y(p.ap_grew)).curve(d3.curveMonotoneX);
  // the lines are revealed by a growing clip rectangle, so the dashed line stays dashed while it draws
  const id = `clip-${Math.random().toString(36).slice(2)}`;
  g.append("clipPath").attr("id", id).append("rect").attr("x", -10).attr("y", -20).attr("height", ih + 40).attr("width", 0)
    .transition().duration(1800).ease(d3.easeCubicOut).attr("width", iw + 20);
  const runs = Object.entries(d.runs).sort(([p]) => (p === d.final ? 1 : -1));   // final model drawn on top
  for (const [name, pts] of runs) {
    const final = name === d.final;
    g.append("path").datum([{ step: 0, ap_grew: 0.03 }, ...pts]).attr("d", line).attr("fill", "none")
      .attr("clip-path", `url(#${id})`).attr("stroke", final ? SIGNAL : INK2).attr("stroke-width", final ? 5 : 3)
      .attr("stroke-dasharray", final ? null : "10 8");
  }
  // the simple method on the same validation units: subtract the two photographs
  if (d.baseline_ap != null) {
    g.append("line").attr("x1", 0).attr("x2", iw).attr("y1", y(d.baseline_ap)).attr("y2", y(d.baseline_ap))
      .attr("stroke", INK).attr("stroke-width", 3).attr("stroke-dasharray", "3 9").attr("stroke-linecap", "round");
    g.append("text").attr("x", iw - 4).attr("y", y(d.baseline_ap) - 16).attr("text-anchor", "end").attr("class", "c-label")
      .style("fill", INK).text(`subtracting the two photos  ${d.baseline_ap.toFixed(2)}`);
  }
  // labels at the end of the lines: final model above, second run below, so they never overlap
  const end = (name) => d.runs[name][d.runs[name].length - 1];
  const other = Object.keys(d.runs).find((n) => n !== d.final);
  g.append("text").attr("x", iw - 4).attr("y", y(end(d.final).ap_grew) - 70).attr("text-anchor", "end")
    .attr("class", "c-label hl").text(`final model  ${end(d.final).ap_grew.toFixed(2)}`);
  g.append("text").attr("x", iw - 4).attr("y", y(end(other).ap_grew) + 70).attr("text-anchor", "end")
    .attr("class", "c-label").style("fill", INK2).text(`second run  ${end(other).ap_grew.toFixed(2)}`);
}

function backbones(div, d) {
  const { svg, g, iw, ih, m } = frame(div, { t: 150, r: 60, b: 120, l: 330 });
  const x = d3.scaleLinear([0, 3.2], [0, iw]), y = d3.scaleBand(d.models.map((r) => r.model), [0, ih]).padding(0.45);
  svg.append("text").attr("x", 60).attr("y", 60).attr("class", "c-title").text("Building height error from one photo (m), lower is better");
  // legend: each dot is one test (an unseen ZIP code in an unseen year); hollow 2022, filled 2025; the bar spans them
  svg.append("circle").attr("cx", 72).attr("cy", 92).attr("r", 10).attr("fill", "#fff").attr("stroke", INK2).attr("stroke-width", 4);
  svg.append("text").attr("x", 92).attr("y", 100).attr("class", "c-note").text("2022");
  svg.append("circle").attr("cx", 172).attr("cy", 92).attr("r", 10).attr("fill", INK2).attr("stroke", INK2).attr("stroke-width", 4);
  svg.append("text").attr("x", 192).attr("y", 100).attr("class", "c-note").text("2025   one dot per unseen ZIP code and year");
  g.append("g").attr("transform", `translate(0,${ih})`).attr("class", "c-axis").call(d3.axisBottom(x).ticks(6));
  for (const r of d.models) {
    const best = r.model.includes("fine-tuned"), yc = y(r.model) + y.bandwidth() / 2, col = best ? SIGNAL : INK2;
    svg.append("text").attr("x", m.l - 24).attr("y", m.t + yc + 9).attr("text-anchor", "end")
      .attr("class", best ? "c-label hl" : "c-label").text(r.model);
    g.append("line").attr("x1", x(r.mae_min)).attr("x2", x(r.mae_min)).attr("y1", yc).attr("y2", yc)
      .attr("stroke", col).attr("stroke-width", 18).attr("stroke-linecap", "round")
      .transition().duration(1200).attr("x2", x(r.mae_max));
    g.selectAll(null).data(r.runs).join("circle").attr("cx", (p) => x(p.mae)).attr("cy", yc).attr("r", 0)
      .attr("fill", (p) => (p.year === 2025 ? col : "#fff")).attr("stroke", col).attr("stroke-width", 4)
      .transition().delay(900).duration(400).attr("r", 11);
    g.append("text").attr("x", x(r.mae_max) + 22).attr("y", yc + 9).attr("class", "c-label")
      .text(`${r.mae_min.toFixed(2)}–${r.mae_max.toFixed(2)}`);
  }
}
