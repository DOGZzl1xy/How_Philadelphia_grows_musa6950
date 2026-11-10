// Explore panel: layer switches and legend (left), and the card for a clicked or named area (on the map).
import { ACS, BLUE, CHANGE, GROWTH, GROWTH_BREAKS, ORANGE, PERIODS, PHOTO_YEARS, YEARS, YEAR_ORDER, acsBreaks, acsColumn, fmt } from "./layers.js";
import { getState, setState, tables } from "./explore-map.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const rate = (n, cov, years) => (cov >= 10 ? (n / cov) * 1000 / years : null);

// collapsed: one line (the active layer) while answers are shown; the reader opens it when needed
let collapsed = false;
export function setCollapsed(c, el) { collapsed = c; if (el) renderLayers(el); }

export function renderLayers(el) {
  const s = getState(), f = s.fill || {};
  el.classList.toggle("collapsed", collapsed);
  if (collapsed) {
    // the colour scale of the active layer stays visible while the switches are folded away
    el.innerHTML = `<button type="button" class="lbar" aria-expanded="false">Map layers<span class="chev"></span></button>${f.type ? legend(f, true) : ""}`;
    el.querySelector(".lbar").addEventListener("click", () => setCollapsed(false, el));
    return;
  }
  const seg = (name, items, on) => `<div class="seg" data-seg="${name}">${items.map(([k, label]) =>
    `<button type="button" data-v="${k}" class="${String(on) === String(k) ? "on" : ""}">${label}</button>`).join("")}</div>`;
  const growthOn = f.type === "growth", modelOn = f.type === "model", acsOn = f.type === "acs";
  el.innerHTML = `
    <button type="button" class="lbar" aria-expanded="true">Map layers<span class="chev"></span></button>
    <section class="lg${growthOn ? " open" : ""}">
      <h3>Measured by LiDAR</h3>
      ${seg("growth", Object.entries(GROWTH).map(([k, g]) => [k, g.label]), growthOn ? f.kind : "")}
      ${growthOn ? seg("period", Object.entries(PERIODS).map(([k, p]) => [k, p.label]), f.period) : ""}
    </section>
    <section class="lg${modelOn ? " open" : ""}">
      <h3>New buildings by year <span class="est">estimated from aerial photos</span></h3>
      ${seg("year", YEAR_ORDER.map((y) => [y, YEARS[y]]).map(([k, y]) => [k, y.label]), modelOn ? f.year : "")}
    </section>
    <section class="lg${acsOn ? " open" : ""}">
      <h3>Census, by block group <span class="est">ACS 5-year</span></h3>
      <select data-acs><option value="">Off</option>${Object.entries(ACS).map(([k, a]) =>
        `<option value="${k}"${acsOn && f.field === k ? " selected" : ""}>${a.label}</option>`).join("")}</select>
      ${acsOn && ACS[f.field].years ? seg("acsyear", [["2019", "2015–19"], ["2023", "2019–23"]], f.year) : ""}
    </section>
    <section class="lg ctx">
      <h3>On the map</h3>
      <label><input type="checkbox" data-ctx="zips"${s.zips ? " checked" : ""}/> ZIP codes</label>
      <label><input type="checkbox" data-ctx="hoods"${s.hoods ? " checked" : ""}/> Neighbourhoods</label>
      <label><input type="checkbox" data-ctx="tracts"${s.tracts ? " checked" : ""}/> Census tracts</label>
      <label><input type="checkbox" data-ctx="rail"${s.rail ? " checked" : ""}/> Rail stops</label>
      <label><input type="checkbox" data-ctx="photo"${s.photo ? " checked" : ""}/> Aerial photo</label>
      ${s.photo ? seg("photo", PHOTO_YEARS.map((y) => [y, y]), s.photo) : ""}
    </section>
    ${legend(f)}`;

  el.querySelector(".lbar").addEventListener("click", () => setCollapsed(true, el));
  el.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => {
    const k = b.parentElement.dataset.seg, val = b.dataset.v, cur = getState().fill || {};
    if (k === "growth") setState({ fill: cur.type === "growth" && cur.kind === val ? null : { type: "growth", kind: val, period: cur.period || "2022_2025" } });
    if (k === "period") setState({ fill: { ...cur, period: val } });
    if (k === "year") setState({ fill: cur.type === "model" && String(cur.year) === val ? null : { type: "model", year: val } });
    if (k === "acsyear") setState({ fill: { ...cur, year: val } });
    if (k === "photo") setState({ photo: +val });
  }));
  el.querySelector("[data-acs]").addEventListener("change", (e) => {
    const val = e.target.value;
    setState({ fill: val ? { type: "acs", field: val, year: "2023" } : null });
  });
  el.querySelectorAll("[data-ctx]").forEach((c) => c.addEventListener("change", () => {
    const k = c.dataset.ctx;
    setState({ [k]: k === "photo" ? (c.checked ? 2025 : null) : c.checked });
  }));
}

function legend(f, compact) {
  if (!f.type) return `<p class="hint">Layers are off. Switch one on, or ask a question.</p>`;
  let title, breaks, colors, kind, note;
  if (f.type === "growth" || f.type === "model") {
    title = f.type === "growth" ? `${GROWTH[f.kind].label}, ${PERIODS[f.period].label}` : `New buildings, ${YEARS[f.year].label} (estimate)`;
    breaks = GROWTH_BREAKS; colors = ORANGE; kind = "rate";
    note = f.type === "growth" ? `${GROWTH[f.kind].note}. Per 1,000 lots per year, 250 m blocks; blocks with fewer than 10 measured lots and high-rise blocks are left blank.`
      : `Model estimate on lots seen in both photos and both LiDAR flights${YEARS[f.year].residual ? "; this year is LiDAR minus the model's earlier years" : ""}. Per 1,000 lots per year.`;
  } else {
    const A = ACS[f.field];
    title = `${A.label}${A.years ? `, ${f.year === "2019" ? "2015–19" : "2019–23"}` : ""}`;
    breaks = acsBreaks(f.field); colors = A.kind === "change" ? CHANGE : BLUE; kind = A.kind;
    note = "American Community Survey 5-year estimates; block-group margins of error are large.";
  }
  const lab = ["under " + fmt(kind, breaks[0]), ...breaks.slice(0, -1).map((b, i) => `${fmt(kind, b)} to ${fmt(kind, breaks[i + 1])}`),
    fmt(kind, breaks.at(-1)) + " or more"].map((x) => x.replace(/-/g, "−"));
  return `<div class="legend"><p class="lt">${esc(title)}</p>
    <div class="ramp">${colors.map((c, i) => `<span><i style="background:${c}"></i>${lab[i]}</span>`).join("")}</div>
    <p class="ln">${esc(compact ? (kind === "rate" ? "Per 1,000 lots per year, 250 m blocks." : "By block group.") : note)}</p></div>`;
}

// ---------- area card ----------
function growthRows(r) {
  return `<table class="mini"><tr><th></th>${Object.values(PERIODS).map((p) => `<th>${p.label}</th>`).join("")}</tr>
    ${Object.values(GROWTH).map((g) => `<tr><td>${g.label}</td>${Object.values(PERIODS).map((p) => {
      const n = r[`${g.key}${p.short}`];
      return `<td>${n == null ? "–" : Math.round(n)}</td>`;
    }).join("")}</tr>`).join("")}
    <tr class="sub"><td>Lots measured</td>${Object.values(PERIODS).map((p) => `<td>${fmt("", Math.round(r[`cov${p.short}`] || 0))}</td>`).join("")}</tr></table>`;
}

function place(r) {
  return [r.hood, r.zip && `ZIP ${r.zip}`].filter(Boolean).map(esc).join(" · ");
}

export function card(level, id) {
  const t = tables[level] || {};
  if (level === "cells") {
    const cellT = tables.cells[id];
    if (!cellT) return `<h4>250 m block</h4><p class="cm">No change measured or estimated in this block.</p>`;
    const r = cellT;
    const years = YEAR_ORDER.map((y) => [y, YEARS[y]]).map(([y, Y]) => [Y.label, r[`y${y}`]]);
    return `<h4>250 m block</h4><p class="cm">${place(r)}</p>
      ${r.hr ? `<p class="cm">High-rise block: left out of the results.</p>` : ""}
      ${growthRows(r)}
      <p class="ch">New buildings by year, estimated</p>
      <div class="bars">${years.map(([l, val]) => `<span><b style="height:${Math.min(40, Math.max(0, val || 0) * 8)}px"></b>${l}</span>`).join("")}</div>
      <p class="cn">Counts of lots; single buildings are not shown.</p>`;
  }
  const r = t[id];
  if (!r) return "";
  if (level === "bgs") {
    const row = (f, y) => { const c = acsColumn(f, y); return fmt(ACS[f].kind, r[c]); };
    const keys = ["inc", "rent", "renter", "vacant", "built2010", "black", "white", "hispanic", "asian", "transit"];
    return `<h4>Block group</h4><p class="cm">${place(r)}</p>
      <table class="mini"><tr><th></th><th>2015–19</th><th>2019–23</th></tr>
      <tr><td>Population</td><td>${fmt("", r.pop19)}</td><td>${fmt("", Math.round(r.pop23))}</td></tr>
      ${keys.map((k) => `<tr><td>${ACS[k].label}</td><td>${row(k, "2019")}</td><td>${row(k, "2023")}</td></tr>`).join("")}</table>
      <p class="ch">Measured by LiDAR</p>
      <table class="mini"><tr><th></th><th>2018–22</th><th>2022–25</th></tr>
      <tr><td>New buildings</td><td>${Math.round(r.n18)}</td><td>${Math.round(r.n22)}</td></tr>
      <tr><td>Added storeys</td><td>${Math.round(r.p18)}</td><td>${Math.round(r.p22)}</td></tr></table>
      <p class="cn">Nearest rail stop ${r.rail_m < 1000 ? `${Math.round(r.rail_m / 50) * 50} m` : `${(r.rail_m / 1000).toFixed(1)} km`}. Income in 2023 dollars.</p>`;
  }
  if (level === "tracts") {
    const row = (f, y) => fmt(ACS[f].kind, r[acsColumn(f, y)]);
    const keys = ["inc", "rent", "renter", "vacant", "black", "white", "hispanic", "transit"];
    const rates = Object.values(PERIODS).map((p) => fmt("rate", rate(r[`n${p.short}`], r[`cov${p.short}`], p.years))).join(" → ");
    return `<h4>Census Tract ${esc(id)}</h4><p class="cm">${place(r)} · 2010 boundaries</p>
      <table class="mini"><tr><th></th><th>2018–22</th><th>2022–25</th></tr>
      <tr><td>New buildings</td><td>${Math.round(r.n18)}</td><td>${Math.round(r.n22)}</td></tr>
      <tr><td>Added storeys</td><td>${Math.round(r.p18)}</td><td>${Math.round(r.p22)}</td></tr></table>
      <p class="cn">New buildings per 1,000 lots per year: ${rates}.</p>
      <p class="ch">Census (ACS)</p>
      <table class="mini"><tr><th></th><th>2015–19</th><th>2019–23</th></tr>
      <tr><td>Population</td><td>${fmt("", Math.round(r.pop19))}</td><td>${fmt("", Math.round(r.pop23))}</td></tr>
      ${keys.map((k) => `<tr><td>${ACS[k].label}</td><td>${row(k, "2019")}</td><td>${row(k, "2023")}</td></tr>`).join("")}</table>
      <p class="cn">Averages of its block groups, weighted by population.</p>`;
  }
  if (level === "hoods" || level === "zips") {
    const title = level === "hoods" ? esc(id) : `ZIP ${esc(id)}`;
    const sub = level === "hoods" ? (r.zips || []).map((z) => `ZIP ${z}`).join(" · ") : r.type ? `Mostly ${r.type} lots` : "";
    const rates = Object.values(PERIODS).map((p) => fmt("rate", rate(r[`n${p.short}`], r[`cov${p.short}`], p.years))).join(" → ");
    const np = level === "zips" && r.noperm_new_of ? `<p class="cn">${Math.round(r.noperm_new)} of ${Math.round(r.noperm_new_of)} new buildings (2018–2025) had no matching permit.</p>` : "";
    return `<h4>${title}</h4><p class="cm">${esc(sub)}</p>${growthRows(r)}
      <p class="cn">New buildings per 1,000 lots per year: ${rates}.</p>${np}`;
  }
  return "";
}
