import "./style.css";
import { steps } from "./steps.js";
import { fly, initZoom, showBlock, showHero } from "./zoom.js";
import { drawChart, drawGrid, drawStack } from "./model.js";
import { v } from "./data.js";
import { heightImage, heightURL, loaded } from "./height.js";
import { ICONS } from "./links.js";

const DATA = "/data/scenes";
const el = (id) => document.getElementById(id);
const photoA = el("photo-a"), photoB = el("photo-b"), canvas = el("height"), svg = el("outlines");
const text = el("text"), yearTag = el("year"), progress = el("progress"), zoomCanvas = el("zoom");
const gridSvg = el("grid"), stackDiv = el("stack"), chartDiv = el("chart");

const scenes = {};          // id -> scene.json
let current = -1, shownPhoto = null, frontIsA = true, lock = false;

// ---------- data ----------
async function scene(id) {
  if (!scenes[id]) scenes[id] = await (await fetch(v(`${DATA}/${id}/scene.json`))).json();
  return scenes[id];
}


// ---------- stage ----------
// what the frame shows for a stage (or for one frame `f` of its time-lapse): a street view redrawn in two tones,
// the block in 3D (iso), or the aerial photograph of a year
function picture(st, f = {}) {
  const year = f.year ?? st.year, iso = f.iso ?? st.iso, street = f.street ?? st.street;
  if (street) return { src: v(`/data/street/a_${street}.webp`), label: street, pale: false };
  if (iso) return { src: v(`${DATA}/${st.scene}/iso_${iso}.webp`), label: year, pale: true };
  return { src: v(`${DATA}/${st.scene}/photo_${year}.webp`), label: year, pale: false };
}
const frameOf = (f) => (typeof f === "object" ? f : { year: f });

let lapseTimer = 0;
function showPhoto({ src, label, pale }, st) {
  yearTag.textContent = label;
  el("frame").classList.toggle("pale", pale || (!!st.height && !st.heightBlend));   // year label in ink on pale pictures
  if (shownPhoto === src) return;
  shownPhoto = src;
  const back = frontIsA ? photoB : photoA, front = frontIsA ? photoA : photoB;
  back.src = src;
  loaded(back).then(() => {
    back.style.opacity = 1;
    front.style.opacity = 0;
    frontIsA = !frontIsA;
  });
}

async function showHeight(id, year, blend) {
  if (!year) { canvas.style.opacity = 0; return; }
  const d = await heightImage(id, year);
  canvas.width = d.width; canvas.height = d.height;
  canvas.getContext("2d").putImageData(d, 0, 0);
  canvas.style.opacity = blend ?? 0.92;
}

// `countOnly`: return the number of units of that mode without drawing them (the 3D pictures carry their own tint)
async function showOutlines(id, mode, countOnly) {
  const s = await scene(id);
  if (countOnly) {
    svg.querySelectorAll("polygon.on").forEach((p) => p.classList.remove("on"));
    return s.units.filter((u) => !!(u.lidar_new["2018_2022"] || u.lidar_new["2022_2025"])).length;
  }
  if (svg.dataset.scene !== id) {
    svg.dataset.scene = id;
    svg.innerHTML = s.units.map((u, i) => u.rings.map((r) =>
      `<polygon data-i="${i}" points="${r.map((p) => p.join(",")).join(" ")}"></polygon>`).join("")).join("");
  }
  // "lidar_new": new construction measured by LiDAR 2018-2025; "model:2019,2020": flagged new by the model in those years
  const years = mode?.startsWith("model:") ? mode.slice(6).split(",") : null;
  const pick = years ? (u) => years.some((y) => u.model_new[y])
    : mode === "lidar_new" ? (u) => !!(u.lidar_new["2018_2022"] || u.lidar_new["2022_2025"]) : () => false;
  svg.querySelectorAll("polygon").forEach((p) => p.classList.toggle("on", pick(s.units[+p.dataset.i])));
  return s.units.filter(pick).length;
}


async function showModelLayers(st) {
  gridSvg.classList.toggle("on", !!st.grid);
  if (st.grid) drawGrid(gridSvg);
  stackDiv.classList.toggle("on", !!st.stack);
  if (st.stack) drawStack(stackDiv, { ...st.stack, scene: st.scene, heightURL: await heightURL(st.scene, st.stack.a) });
  chartDiv.classList.toggle("on", !!st.chart);
  chartDiv.classList.toggle("side", st.view === "side");   // iso blocks: tilt from above to the side
  chartDiv.classList.toggle("rail", !!st.rail);            // city map: bring in the rail stops
  yearTag.style.opacity = st.stack || st.chart ? 0 : 1;
  if (st.chart) drawChart(chartDiv, st.chart, st.chart === "arch"
    ? { scene: st.scene, a: 2018, b: 2020, heightURL: await heightURL(st.scene, 2018) } : {});
}

// ---------- steps ----------
function countUp(node, to) {
  const t0 = performance.now(), dur = 1100;
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// data each chart needs, fetched one screen ahead (the browser cache then serves the chart instantly)
const PREFETCH = {
  data: ["model/zips.geojson"], training: ["model/training.json"], backbones: ["model/backbones.json"],
  scatter: ["results/test_cells.json"], yearly: ["results/yearly.json"], income: ["results/income.json"],
  area: ["results/area_type.json"],
  map: ["results/cells.geojson", "results/rail.json", "model/zips.geojson"],
  streetmap: ["results/street.json", "model/zips.geojson"],
  wall: ["street/wall_before.webp", "street/wall_after.webp"],
};
let busyUntil = 0;
async function go(i) {
  if (i < 0 || i >= steps.length || i === current) return;
  const was = steps[current], s = steps[i], st = s.stage;
  const first = current === -1;
  current = i;
  progress.querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
  history.replaceState(null, "", `#${i}`);
  // a time-lapse plays its frames in a loop and rests on the last one
  clearTimeout(lapseTimer);
  showPhoto(picture(st, st.lapse ? frameOf(st.lapse[0]) : {}), st);
  if (st.lapse) {
    let k = 0;
    const every = st.every || 1100, tick = () => {
      if (current !== i) return;
      k = (k + 1) % st.lapse.length;
      showPhoto(picture(st, frameOf(st.lapse[k])), st);
      lapseTimer = setTimeout(tick, k === st.lapse.length - 1 ? every * 2.6 : every);
    };
    for (const f of st.lapse) new Image().src = picture(st, frameOf(f)).src;
    lapseTimer = setTimeout(tick, every * 1.6);
  }
  showHeight(st.scene, st.height, st.heightBlend);
  showModelLayers(st);
  let textDelay = 0;
  const LAYOUT = 1100;   // ms, the frame's size/position transition in style.css
  if (s.hero) {
    zoomCanvas.style.opacity = 1;
    if (first) { document.body.classList.add("hero"); showHero(); }
    else {
      // back to the cover, all at once: the frame opens to full screen while the view zooms out; title at the end
      busyUntil = performance.now() + 2600;
      text.innerHTML = "";
      showBlock();
      document.body.classList.add("hero");
      textDelay = 1700;
      fly(false, 2400);
    }
  } else if (was?.hero) {
    // leaving the cover, all at once: the frame settles into the square while the view flies down to the block;
    // the text arrives as the frame lands, and the 2025 block on the canvas fades into this step's photo
    busyUntil = performance.now() + 2800;
    textDelay = LAYOUT - 200;
    document.body.classList.remove("hero");
    fly(true, 2600).then(() => { zoomCanvas.style.opacity = 0; });
  } else {
    document.body.classList.remove("hero");
    zoomCanvas.style.opacity = 0;
  }
  const total = await showOutlines(st.scene, st.outlines, st.count);
  function render() {
    if (current !== i) return;
    text.innerHTML = `<div class="step">${s.html}</div>`;
    text.querySelectorAll("[data-count]").forEach((n) => countUp(n, total));
  }
  if (textDelay > 0) { text.innerHTML = ""; setTimeout(render, textDelay); }
  else if (textDelay === 0) render();
  // warm the cache for the next screen
  const n = steps[i + 1];
  if (n) {
    new Image().src = picture(n.stage, n.stage.lapse ? frameOf(n.stage.lapse[0]) : {}).src;
    for (const f of PREFETCH[n.stage.chart] || []) fetch(v(`/data/${f}`)).catch(() => {});
  }
}

// one wheel gesture, key press or swipe = one step
function step(dir) {
  if (lock || performance.now() < busyUntil) return;
  lock = true;
  setTimeout(() => (lock = false), 900);
  go(current + dir);
}
addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) > 8) step(e.deltaY > 0 ? 1 : -1); }, { passive: true });
addEventListener("keydown", (e) => {
  if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); step(1); }
  if (["ArrowUp", "ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); step(-1); }
  if (e.key === "Home") go(0);
  if (e.key === "End") go(steps.length - 1);
});
let y0 = null;
addEventListener("touchstart", (e) => (y0 = e.touches[0].clientY), { passive: true });
addEventListener("touchend", (e) => {
  if (y0 === null) return;
  const dy = y0 - e.changedTouches[0].clientY;
  if (Math.abs(dy) > 40) step(dy > 0 ? 1 : -1);
  y0 = null;
});

progress.innerHTML = steps.map((s, k) =>
  `<button aria-label="Step ${k + 1}" class="${k && s.act !== steps[k - 1].act ? "gap" : ""}"></button>`).join("");
progress.querySelectorAll("button").forEach((b, k) => b.addEventListener("click", () => go(k)));

el("to-explore").innerHTML = `${ICONS.search}<span>Explore</span>`;
initZoom(zoomCanvas);
const fromHash = () => go(Math.min(steps.length - 1, Math.max(0, parseInt(location.hash.slice(1)) || 0)));
addEventListener("hashchange", fromHash);
fromHash();
