// Tools the assistant can call. Every tool reads aggregated tables only and returns small JSON. Area ids are ZIP
// codes, neighbourhood names, 250 m cell ids and block-group ids; none of them is shown to the reader except ZIP codes
// and neighbourhood names (the prompt says so), and no tool returns coordinates.
import type { Row, Tables } from "./data";

export const PERIODS = { "2018_2022": { s: "18", years: 4, label: "2018–2022" }, "2022_2025": { s: "22", years: 3, label: "2022–2025" } } as const;
type Period = keyof typeof PERIODS;
const KINDS = { new: "n", popup: "p", demo: "d" } as const;
type Kind = keyof typeof KINDS;
export const MODEL_YEARS: Record<string, { years: number; set: "au" | "bu"; note?: string }> = {
  "2019": { years: 1, set: "au" }, "2020": { years: 1, set: "au" },
  "2021_22": { years: 2, set: "au", note: "LiDAR 2018-2022 minus the model's 2019-2020" },
  "2023": { years: 1, set: "bu" }, "2024": { years: 1, set: "bu" },
  "2025": { years: 1, set: "bu", note: "LiDAR 2022-2025 minus the model's 2023-2024" },
};
export const ACS_FIELDS: Record<string, { label: string; kind: "share" | "money" | "change"; years: boolean }> = {
  inc: { label: "median household income (2023 dollars)", kind: "money", years: true },
  inc_chg: { label: "real median income change 2015-19 to 2019-23", kind: "change", years: false },
  pop_chg: { label: "population change 2015-19 to 2019-23", kind: "change", years: false },
  rent: { label: "median gross rent", kind: "money", years: true },
  renter: { label: "renter-occupied share of households", kind: "share", years: true },
  vacant: { label: "vacant share of housing units", kind: "share", years: true },
  built2010: { label: "share of homes built 2010 or later", kind: "share", years: true },
  pre1940: { label: "share of homes built before 1940", kind: "share", years: true },
  black: { label: "Black, not Hispanic, share of population", kind: "share", years: true },
  white: { label: "White, not Hispanic, share of population", kind: "share", years: true },
  hispanic: { label: "Hispanic or Latino share of population", kind: "share", years: true },
  asian: { label: "Asian, not Hispanic, share of population", kind: "share", years: true },
  transit: { label: "share of workers commuting by public transit", kind: "share", years: true },
  walk: { label: "share of workers commuting on foot or by bike", kind: "share", years: true },
  car: { label: "share of workers commuting by car", kind: "share", years: true },
  wfh: { label: "share of workers working from home", kind: "share", years: true },
};

const tractOfBg = (bg: string) => { const c = bg.slice(5, 11); return `${parseInt(c.slice(0, 4), 10)}${c.slice(4) === "00" ? "" : `.${c.slice(4)}`}`; };
const r2 = (x: number | null | undefined, k = 2) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** k) / 10 ** k);
const rate = (n: number, cov: number, years: number) => (cov >= 10 ? r2((n / cov) * 1000 / years) : null);
const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

// ---------- areas ----------
type Level = "zip" | "neighbourhood" | "tract" | "cell" | "block_group" | "city";

// census tracts (2010 boundaries): "CT30.01", "tract 30.01", "census tract 3001", "003001" -> "30.01"
const TRACT_RE = /\b(?:ct|census\s*tract|tract)\s*#?\s*(\d{1,6}(?:\.\d{1,2})?)\b/i;
export function tractId(t: Tables, raw: string): string | null {
  let x = raw.trim();
  if (/^\d{6}$/.test(x)) x = `${parseInt(x.slice(0, 4), 10)}${x.slice(4) === "00" ? "" : `.${x.slice(4)}`}`;
  if (t.tracts[x]) return x;
  if (/^\d{3,4}$/.test(x)) { const y = `${parseInt(x.slice(0, -2), 10)}.${x.slice(-2)}`; if (t.tracts[y]) return y; }
  if (/^\d+\.\d$/.test(x) && t.tracts[`${x}0`]) return `${x}0`;
  return null;
}

function findHood(t: Tables, name: string): { match?: string; candidates: string[] } {
  const n = norm(name), names = Object.keys(t.hoods);
  const exact = names.find((h) => norm(h) === n);
  if (exact) return { match: exact, candidates: [] };
  const part = names.filter((h) => norm(h).includes(n) || (n.length > 4 && n.includes(norm(h))));
  if (part.length === 1) return { match: part[0], candidates: [] };
  return { candidates: part.slice(0, 8) };
}

function growth(r: Row) {
  const out: Row = {};
  for (const [p, P] of Object.entries(PERIODS)) {
    const cov = r[`cov${P.s}`] || 0;
    out[P.label] = { lots_measured: Math.round(cov), ...Object.fromEntries(Object.entries(KINDS).map(([k, s]) => [k === "new" ? "new_buildings" : k === "popup" ? "added_storeys" : "demolitions",
      { count: Math.round(r[`${s}${P.s}`] || 0), per_1000_lots_per_year: rate(r[`${s}${P.s}`] || 0, cov, P.years) }])) };
  }
  return out;
}

function modelYears(r: Row) {
  if (r.au == null) return undefined;
  return Object.fromEntries(Object.entries(MODEL_YEARS).map(([y, Y]) => [y.replace("_", "-"), {
    estimated_new_buildings: Math.round(Math.max(r[`y${y}`] || 0, 0)), per_1000_lots_per_year: rate(Math.max(r[`y${y}`] || 0, 0), r[Y.set] || 0, Y.years),
    lots: Math.round(r[Y.set] || 0), ...(Y.note ? { note: Y.note } : {}) }]));
}

function census(t: Tables, filter: (b: Row) => boolean) {
  for (const [id, b] of Object.entries(t.bgs)) if (b.tract === undefined) b.tract = tractOfBg(id);
  const bs = Object.values(t.bgs).filter(filter);
  if (!bs.length) return undefined;
  const out: Row = { block_groups: bs.length, population_2015_19: Math.round(bs.reduce((a, b) => a + (b.pop19 || 0), 0)),
    population_2019_23: Math.round(bs.reduce((a, b) => a + (b.pop23 || 0), 0)), note: "population-weighted means of block-group values; medians are approximate" };
  for (const [f, F] of Object.entries(ACS_FIELDS)) {
    if (!F.years) continue;
    for (const [suf, w] of [["19", "pop19"], ["23", "pop23"]]) {
      let s = 0, ws = 0;
      for (const b of bs) if (typeof b[`${f}${suf}`] === "number" && b[w] > 0) { s += b[`${f}${suf}`] * b[w]; ws += b[w]; }
      out[`${f}_${suf === "19" ? "2015_19" : "2019_23"}`] = ws ? r2(s / ws, F.kind === "money" ? 0 : 3) : null;
    }
  }
  return out;
}

export function lookupArea(t: Tables, a: { name: string }) {
  const q = String(a.name || "").trim();
  if (/^191\d\d$/.test(q)) return t.zips[q] ? { level: "zip", id: q, location: t.places.zips[q],
    neighbourhoods: Object.entries(t.hoods).filter(([, h]) => (h.zips || []).includes(q)).map(([n]) => n) } : { error: `ZIP ${q} is not in the study area` };
  if (/^(philadelphia|city|citywide|the city)$/i.test(q)) return { level: "city", id: "city" };
  const tm = q.match(TRACT_RE) || (/^\d{1,6}(\.\d{1,2})?$/.test(q) ? [q, q] : null);
  if (tm) {
    const id = tractId(t, tm[1]);
    return id ? { level: "tract", id, name: `Census Tract ${id}`, boundaries: "2010 tract boundaries (as used for ACS 2015-19)",
      neighbourhood: t.tracts[id].hood, zip: t.tracts[id].zip, location: t.places.tracts[id] }
      : { error: `no census tract ${tm[1]} in the study area; the project uses 2010 tract boundaries, and some tracts were split or renumbered in 2020` };
  }
  const h = findHood(t, q);
  if (h.match) return { level: "neighbourhood", id: h.match, zips: t.hoods[h.match].zips, location: t.places.hoods[h.match] };
  return h.candidates.length ? { error: "ambiguous", candidates: h.candidates } : { error: `no neighbourhood or ZIP code matches "${q}"` };
}

// named rail stations: subway / elevated and regional rail (trolley stops are street corners and have no names here)
const stationKey = (x: string) => norm(x.replace(/\bstreet\b/gi, "st").replace(/\bavenue\b/gi, "av").replace(/\bstation\b/gi, ""));
export function findStation(t: Tables, a: { name?: string; neighbourhood?: string; zip?: string }) {
  const row = (v: Row) => ({ station: v.name, mode: v.mode, lines: v.lines, neighbourhood: v.neighbourhood, zip: v.zip,
    map_focus: v.cell ? { level: "cell", id: v.cell } : { level: "neighbourhood", id: v.neighbourhood } });
  // every named station of one neighbourhood or ZIP code: the complete list, so "how many" has one answer
  if (a.neighbourhood || a.zip) {
    const hood = a.neighbourhood ? (t.hoods[a.neighbourhood] ? a.neighbourhood : findHood(t, a.neighbourhood).match) : null;
    if (a.neighbourhood && !hood) return { error: `no neighbourhood matches "${a.neighbourhood}"`, candidates: findHood(t, a.neighbourhood).candidates };
    const zip = a.zip ? String(a.zip) : null;
    if (zip && !t.zips[zip]) return { error: "unknown ZIP code" };
    const inArea = Object.values(t.stations).filter((v) => (hood ? v.neighbourhood === hood : v.zip === zip));
    return { area: hood ? { level: "neighbourhood", id: hood } : { level: "zip", id: zip }, named_stations: inArea.length, stations: inArea.map(row),
      note: "complete list of named stations (subway / elevated and regional rail) inside this area; trolley stops have no names in this project and are not counted" };
  }
  const q = stationKey(String(a.name || ""));
  if (q.length < 2) return { error: "give a station name, a neighbourhood or a ZIP code" };
  const hits = Object.entries(t.stations).filter(([k, v]) => stationKey(v.name).includes(q) || (q.length > 4 && q.includes(stationKey(v.name))));
  if (!hits.length) return { error: `no subway, elevated or regional rail station matches "${a.name}"; trolley stops have no names in this project` };
  return { stations: hits.slice(0, 6).map(([, v]) => row(v)) };
}

export function areaStats(t: Tables, a: { level: Level; id: string }) {
  if (a.level === "city") return citywide(t, { topic: "rates" });
  if (a.level === "zip") {
    const r = t.zips[a.id];
    if (!r) return { error: "unknown ZIP code" };
    return { zip: a.id, lots: r.units, lots_in_high_rise_blocks_left_out: r.hr_units || undefined, mostly: r.type, lidar: growth(r), model_new_buildings_by_year: modelYears(r),
      new_buildings_without_matching_permit_2018_2025: r.noperm_new_of ? { count: r.noperm_new, of: r.noperm_new_of } : undefined,
      added_storeys_without_matching_permit_2018_2025: r.noperm_popup_of ? { count: r.noperm_popup, of: r.noperm_popup_of } : undefined,
      census: census(t, (b) => b.zip === a.id) };
  }
  if (a.level === "neighbourhood") {
    const name = t.hoods[a.id] ? a.id : findHood(t, a.id).match;
    if (!name) return { error: "unknown neighbourhood" };
    const r = t.hoods[name];
    return { neighbourhood: name, zips: r.zips, lots: r.units, lots_in_high_rise_blocks_left_out: r.hr_units || undefined, lidar: growth(r), model_new_buildings_by_year: modelYears(r),
      census: census(t, (b) => b.hood === name) };
  }
  if (a.level === "tract") {
    const id = tractId(t, String(a.id).replace(TRACT_RE, "$1"));
    if (!id) return { error: "unknown census tract (2010 boundaries)" };
    const r = t.tracts[id];
    return { tract: `Census Tract ${id}`, boundaries: "2010", neighbourhood: r.hood, zip: r.zip, lots: r.units,
      lidar: growth({ ...r, d18: 0, d22: 0 }), model_new_buildings_by_year: modelYears(r), census: census(t, (b) => b.tract === id),
      note: "growth = sum of its block groups (high-rise blocks left out); census values are population-weighted means of its block groups" };
  }
  if (a.level === "cell") {
    const r = t.cells[a.id];
    if (!r) return { cell: a.id, note: "no change measured or estimated in this 250 m block" };
    return { cell: a.id, neighbourhood: r.hood, zip: r.zip, lots: r.units, high_rise_block: !!r.hr, lidar: growth(r), model_new_buildings_by_year: modelYears(r) };
  }
  if (a.level === "block_group") {
    const r = t.bgs[a.id];
    if (!r) return { error: "unknown block group" };
    return { block_group: a.id, neighbourhood: r.hood, zip: r.zip, nearest_rail_stop_m: Math.round(r.rail_m), rowhouse_share: r.rowhouse,
      lidar: growth({ ...r, d18: 0, d22: 0 }), census: census(t, (b) => b === r) };
  }
  return { error: "unknown level" };
}

// ---------- ranking ----------
function stationArea(t: Tables, cell: string) {
  const [i, j] = cell.split("_").map(Number), sum: Row = {};
  for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
    const c = t.cells[`${i + di}_${j + dj}`];
    if (!c || c.hr) continue;
    for (const k of ["n18", "n22", "p18", "p22", "d18", "d22", "y2019", "y2020", "y2021_22", "y2023", "y2024", "y2025"]) sum[k] = (sum[k] || 0) + Math.max(c[k] || 0, 0);
  }
  return sum;
}

export function rankStations(t: Tables, a: { metric: string; period?: string; year?: string; order?: string; limit?: number }) {
  const P = PERIODS[(a.period as Period) || "2022_2025"];
  const key = a.metric === "model_new" ? `y${a.year}` : `${KINDS[a.metric as Kind] || "n"}${P.s}`;
  const seen = new Set<string>();
  const rows = Object.values(t.stations).filter((st) => st.cell && !seen.has(st.name) && seen.add(st.name))
    .map((st) => ({ station: st.name, mode: st.mode, neighbourhood: st.neighbourhood, zip: st.zip, value: Math.round(stationArea(t, st.cell)[key] || 0) }))
    .sort((x, y) => (a.order === "asc" ? x.value - y.value : y.value - x.value)).slice(0, Math.min(a.limit || 10, 15));
  return { unit: `${a.metric === "model_new" ? `estimated new buildings in ${a.year}` : `${a.metric === "popup" ? "added storeys" : a.metric === "demo" ? "demolitions" : "new buildings"}, LiDAR ${P.label}`} within the 5 x 5 block of 250 m cells around each station (about 600 m each way), counts`,
    note: "high-rise blocks left out; neighbouring stations share cells; trolley stops are not included", results: rows };
}

export function rankAreas(t: Tables, a: { level: Level; metric: string; period?: string; year?: string; by?: "count" | "rate";
  order?: "desc" | "asc"; limit?: number; within?: { level: Level; id: string }; acs_period?: string }) {
  const limit = Math.min(Math.max(a.limit || 10, 1), a.level === "cell" ? 30 : 15);
  const desc = a.order !== "asc";
  let items: { id: string; row: Row }[] = [];
  const src = a.level === "zip" ? t.zips : a.level === "neighbourhood" ? t.hoods : a.level === "tract" ? t.tracts : a.level === "cell" ? t.cells
    : a.level === "block_group" ? t.bgs : null;
  if (!src) return { error: "level must be zip, neighbourhood, tract, cell or block_group" };
  items = Object.entries(src).map(([id, row]) => ({ id, row }));
  if (a.within && a.within.level !== "city") {
    const w = a.within;
    const hood = w.level === "neighbourhood" ? (t.hoods[w.id] ? w.id : findHood(t, w.id).match) : null;
    items = items.filter(({ id, row }) => (w.level === "zip" ? (a.level === "zip" ? id === w.id : row.zip === w.id || (row.zips || []).includes(w.id))
      : w.level === "neighbourhood" ? row.hood === hood || id === hood : true));
  }
  let value: (r: Row) => number | null, unit: string, note: string | undefined;
  if (a.metric in KINDS) {
    const P = PERIODS[(a.period as Period) || "2022_2025"];
    if (!P) return { error: "period must be 2018_2022 or 2022_2025" };
    const s = KINDS[a.metric as Kind];
    if ((a.level === "block_group" || a.level === "tract") && a.metric === "demo") return { error: "demolitions are not available per block group or tract" };
    const byRate = a.by === "rate" && a.level !== "cell";
    const minLots = a.level === "block_group" ? 100 : a.level === "tract" ? 300 : 500;
    value = (r) => (r.hr ? null : byRate ? (r[`cov${P.s}`] >= minLots ? rate(r[`${s}${P.s}`] || 0, r[`cov${P.s}`], P.years) : null) : r[`${s}${P.s}`] ?? 0);
    unit = `${byRate ? "per 1,000 measured lots per year" : "count"}, ${a.metric === "new" ? "new buildings" : a.metric === "popup" ? "added storeys" : "demolitions"}, LiDAR ${P.label}`;
    if (byRate) note = `areas with fewer than ${minLots} measured lots left out`;
  } else if (a.metric === "no_permit_new" || a.metric === "no_permit_popup") {
    if (a.level !== "zip") return { error: "changes without a matching permit are available per ZIP code only" };
    const ev = a.metric === "no_permit_new" ? "new" : "popup";
    const byShare = a.by === "rate";
    value = (r) => (r[`noperm_${ev}_of`] ? (byShare ? (r[`noperm_${ev}_of`] >= 20 ? r2(r[`noperm_${ev}`] / r[`noperm_${ev}_of`], 3) : null) : r[`noperm_${ev}`]) : null);
    unit = `${byShare ? "share" : "number"} of LiDAR-detected ${ev === "new" ? "new buildings" : "added storeys"} 2018-2025 with no related permit on the lot`;
    note = byShare ? "ZIP codes with fewer than 20 detected changes left out; part of the residual is parcel-matching error" : "part of the residual is parcel-matching error";
  } else if (a.metric === "model_new") {
    const Y = MODEL_YEARS[String(a.year || "")];
    if (!Y) return { error: "year must be one of 2019, 2020, 2021_22, 2023, 2024, 2025" };
    if (a.level === "block_group") return { error: "model years are available for cells, tracts, ZIP codes and neighbourhoods" };
    value = (r) => (r.hr ? null : r2(Math.max(r[`y${a.year}`] || 0, 0), 1));
    unit = `estimated new buildings in ${String(a.year).replace("_", "-")} (model, from aerial photos)`;
    note = Y.note;
  } else if (a.metric in ACS_FIELDS) {
    if (a.level === "cell") return { error: "census metrics are available for block groups, neighbourhoods and ZIP codes" };
    const F = ACS_FIELDS[a.metric];
    const col = F.years ? `${a.metric}${a.acs_period === "2015_19" ? "19" : "23"}` : a.metric;
    const w = a.acs_period === "2015_19" ? "pop19" : "pop23";
    const minPop = F.kind === "money" ? 500 : 200;
    if (a.level === "block_group" || a.level === "tract") {
      const minP = a.level === "tract" ? 500 : minPop;
      value = (r) => (typeof r[col] === "number" && (r.pop23 || 0) >= minP ? r[col] : null);
      note = `${a.level === "tract" ? "tracts (2010 boundaries; population-weighted means of their block groups)" : "block groups"} with fewer than ${minP} residents left out; ACS margins of error are large`;
    } else {
      // population-weighted mean of the block groups whose centre lies in the area (medians: an approximation)
      const agg: Record<string, { s: number; w: number; pop: number }> = {};
      for (const b of Object.values(t.bgs)) {
        const k = a.level === "zip" ? b.zip : b.hood;
        if (!k || typeof b[col] !== "number" || !(b[w] > 0)) continue;
        const g = (agg[k] ||= { s: 0, w: 0, pop: 0 });
        g.s += b[col] * b[w]; g.w += b[w]; g.pop += b[w];
      }
      items = items.filter(({ id }) => agg[id] && agg[id].pop >= 1000)
        .map(({ id, row }) => ({ id, row: { ...row, __v: r2(agg[id].s / agg[id].w, F.kind === "money" ? 0 : 3) } }));
      value = (row) => row.__v ?? null;
      note = "population-weighted mean of block-group values (medians approximate); areas with fewer than 1,000 residents left out; ACS margins of error are large";
    }
    if (a.metric === "rent") note += "; ACS top-codes median rent at $3,501 (meaning $3,500 or more)";
    unit = `${F.label}${F.years ? `, ACS ${a.acs_period === "2015_19" ? "2015-19" : "2019-23"}` : ""}`;
  } else return { error: "unknown metric" };
  const valued = items.map(({ id, row }) => ({ id, row, v: value(row) })).filter((x) => x.v != null);
  const counts = { areas_with_a_value: valued.length, areas_with_zero: valued.filter((x) => x.v === 0).length,
    areas_above_zero: valued.filter((x) => (x.v as number) > 0).length };
  const ranked = valued.filter((x) => (desc ? (x.v as number) > 0 : true))
    .sort((x, y) => (desc ? (y.v as number) - (x.v as number) : (x.v as number) - (y.v as number))).slice(0, limit);
  const hoodsOf = (z: string) => Object.entries(t.hoods).filter(([, h]) => (h.zips || []).includes(z)).sort((x, y) => (y[1].units || 0) - (x[1].units || 0)).slice(0, 4).map(([n]) => n);
  const label = (id: string, row: Row) => (a.level === "zip" ? { zip: id, main_neighbourhoods: hoodsOf(id) } :
    a.level === "tract" ? { tract: `Census Tract ${id}`, id, neighbourhood: row.hood, zip: row.zip } : a.level === "neighbourhood" ? { neighbourhood: id, zips: row.zips }
    : { id, neighbourhood: row.hood, zip: row.zip });
  const show = (v: number) => {
    if (a.metric in ACS_FIELDS) { const k = ACS_FIELDS[a.metric].kind;
      return k === "money" ? `$${Math.round(v).toLocaleString("en-US")}` : k === "share" ? `${(v * 100).toFixed(1)}%` : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`; }
    if (unit.startsWith("per 1,000")) return `${v} per 1,000 measured lots per year`;
    if (a.metric === "model_new") return `about ${Math.round(v)} new buildings (estimate)`;
    if (a.metric.startsWith("no_permit")) return a.by === "rate" ? `${(v * 100).toFixed(1)}%` : `${v} buildings`;
    return `${v} ${a.metric === "new" ? "new buildings" : a.metric === "popup" ? "added storeys" : "demolitions"}`;
  };
  return { level: a.level, unit, note, counts, results: ranked.map((x) => ({ ...label(x.id, x.row), value: a.metric === "model_new" ? Math.round(x.v as number) : x.v, display: show(x.v as number) })),
    results_shown: `${ranked.length} of ${counts.areas_with_a_value} (top ${limit} at most)` };
}

// ---------- city-wide ----------
export function citywide(t: Tables, a: { topic: string }) {
  const c = t.city;
  switch (a.topic) {
    case "rates": return { note: "LiDAR-measured events per 1,000 lots per year; compare periods on the lots covered in both (the 2018 flight covers fewer, more central lots)",
      lots_covered_in_both_periods: c.rates_units_covered_in_both_periods, all_covered_lots: c.rates_all_covered_units,
      concentration_2018_2025_both_periods_together: { top_10pct_of_250m_cells_share: c.concentration_top10pct_cells, share_of_cells_with_any: c.cells_250m_with_any } };
    case "yearly": return { note: "new buildings per 1,000 lots per year on one fixed set of lots; model years are estimates, 2021-22 and 2025 are LiDAR minus model", ...c.yearly_new_per_1000_fixed_units };
    case "permits": return { permit_to_construction: c.permits.permit_to_construction, without_matching_permit: c.permits.unpermitted,
      time_to_detection_new_construction_permits: c.permit_time_to_detection,
      note: "permits are matched to LiDAR measurements (not to the model). Share of permits issued 2018-2020 whose lot shows the change in LiDAR. 'addition (any)' permits are mostly rear or interior work that leaves roof height unchanged, so few show an added storey; upward-addition permits are the comparable group. Not visible by 2025 does not mean never built (lag). 'without matching permit' = LiDAR change with no related permit on the lot from 3 years before the period to its end; part of it is parcel-matching error" };
    case "homes": return { floor_area_and_homes: c.floor_area_and_homes, note: "rough: floor area = footprint x storeys; homes = floor area / 122.7 m2 per home from permits; pop-up homes are an upper bound" };
    case "model_test": return { sealed_test_2022_2025: c.sealed_test_2022_2025, note: "run once on 8 ZIP codes never used in training; r = correlation between model estimate and LiDAR per cell; the bar for filling years was r >= 0.8 at 250 m: new buildings pass (0.96), added storeys fail (0.42)" };
    default: return { error: "topic must be rates, yearly, permits, homes or model_test" };
  }
}

export function compareGroups(t: Tables, a: { by: string }) {
  if (a.by === "rail_distance") return { note: "distance from the lot to the nearest subway, elevated, trolley or regional rail stop", rows: t.by.rail_distance };
  if (a.by === "area_type") return { note: "lot type of the surrounding area", rows: t.by.area_type };
  if (a.by === "income_level" || a.by === "income_change") {
    const rows = t.by.income.filter((r) => (a.by === "income_level" ? r.by.startsWith("baseline") : r.by.startsWith("real")));
    return { note: "block-group quintiles (Q1 lowest); LiDAR events per 1,000 lots per year, 2018-2025; associations, not causes", rows };
  }
  return { error: "by must be rail_distance, area_type, income_level or income_change" };
}

export const TOOL_DEFS = [
  { type: "function", function: { name: "lookup_area", description: "Resolve a place the reader names (neighbourhood name, ZIP code, census tract such as 'CT 30.01', or the city) to an area id, with where it lies in words (direction and distance from City Hall, neighbouring areas and their directions). Use the English neighbourhood name from the list in the instructions.",
    parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
  { type: "function", function: { name: "find_station", description: "Subway, elevated and regional rail stations. Give name to find a station (e.g. '30th Street', 'City Hall', 'Temple') and the neighbourhood and ZIP code it is in; give neighbourhood or zip instead to get the complete list and the number of named stations in that area (use this for 'which / how many stations in ...'). Use map_focus or area from the result in update_map.",
    parameters: { type: "object", properties: { name: { type: "string" }, neighbourhood: { type: "string" }, zip: { type: "string" } } } } },
  { type: "function", function: { name: "rank_stations", description: "Rank subway, elevated and regional rail stations by growth around them (counts in about 600 m each way): which station areas built the most.",
    parameters: { type: "object", properties: { metric: { type: "string", enum: ["new", "popup", "demo", "model_new"] }, period: { type: "string", enum: ["2018_2022", "2022_2025"] },
      year: { type: "string", enum: Object.keys(MODEL_YEARS) }, order: { type: "string", enum: ["desc", "asc"] }, limit: { type: "integer" } }, required: ["metric"] } } },
  { type: "function", function: { name: "area_stats", description: "All numbers for one area: LiDAR-measured new buildings, added storeys and demolitions per period (counts and per 1,000 lots per year), model-estimated new buildings per year, permits (ZIP only), census summary.",
    parameters: { type: "object", properties: { level: { type: "string", enum: ["zip", "neighbourhood", "tract", "cell", "block_group", "city"] }, id: { type: "string" } }, required: ["level", "id"] } } },
  { type: "function", function: { name: "rank_areas", description: "Rank ZIP codes, neighbourhoods, census tracts, 250 m cells or block groups by a metric, optionally within one ZIP code or neighbourhood. Also returns counts (areas with a value, with zero, above zero), so 'how many areas had none' needs one call. Returns ids to highlight on the map.",
    parameters: { type: "object", properties: {
      level: { type: "string", enum: ["zip", "neighbourhood", "tract", "cell", "block_group"] },
      metric: { type: "string", enum: ["new", "popup", "demo", "model_new", "no_permit_new", "no_permit_popup", ...Object.keys(ACS_FIELDS)], description: "new / popup (added storeys) / demo: LiDAR, needs period. model_new: model estimate, needs year. no_permit_new / no_permit_popup: LiDAR changes 2018-2025 without a matching permit, ZIP level only (by=rate gives the share). Census fields: block groups, neighbourhoods or ZIP codes (population-weighted)." },
      period: { type: "string", enum: ["2018_2022", "2022_2025"] }, year: { type: "string", enum: Object.keys(MODEL_YEARS) },
      by: { type: "string", enum: ["count", "rate"], description: "LiDAR metrics: rank by count or by rate per 1,000 measured lots per year" },
      order: { type: "string", enum: ["desc", "asc"] }, limit: { type: "integer" }, acs_period: { type: "string", enum: ["2015_19", "2019_23"] },
      within: { type: "object", properties: { level: { type: "string", enum: ["zip", "neighbourhood"] }, id: { type: "string" } } } },
      required: ["level", "metric"] } } },
  { type: "function", function: { name: "citywide", description: "City-wide results: rates (how much, both periods, concentration), yearly (when), permits (permits that became buildings, changes without permits, time from permit to building), homes (floor area and rough number of homes), model_test (how accurate the model is).",
    parameters: { type: "object", properties: { topic: { type: "string", enum: ["rates", "yearly", "permits", "homes", "model_test"] } }, required: ["topic"] } } },
  { type: "function", function: { name: "compare_groups", description: "LiDAR rates of new buildings and added storeys by distance to rail, by area type (rowhouse, mixed use, detached), by block-group income level or income change.",
    parameters: { type: "object", properties: { by: { type: "string", enum: ["rail_distance", "area_type", "income_level", "income_change"] } }, required: ["by"] } } },
  { type: "function", function: { name: "update_map", description: "Change the map next to the answer: switch one data layer on (or off), show outlines, zoom to areas and highlight them. Growth layers are drawn per 250 m cell, census (acs_*) layers per block group, whatever level you ranked. Call it once per answer that concerns places or a pattern.",
    parameters: { type: "object", properties: {
      layer: { type: "string", enum: ["keep", "off", "new_2018_2022", "new_2022_2025", "popup_2018_2022", "popup_2022_2025", "demo_2018_2022", "demo_2022_2025",
        ...Object.keys(MODEL_YEARS).map((y) => `model_${y}`), ...Object.keys(ACS_FIELDS).map((f) => `acs_${f}`)] },
      acs_period: { type: "string", enum: ["2015_19", "2019_23"] },
      show_zips: { type: "boolean" }, show_neighbourhoods: { type: "boolean" }, show_tracts: { type: "boolean" }, show_rail: { type: "boolean" },
      show_street_houses: { type: "boolean", description: "the houses seen taller from the street 2018-2025, one dot per house (found, not counted)" },
      play_years: { type: "array", items: { type: "string", enum: Object.keys(MODEL_YEARS) }, description: "play the new-buildings-by-year layers one after another on the map, in time order (at least two years); use it whenever the reader asks to see change over several years or from one year to another" },
      columns_3d: { type: "boolean", description: "true: tilt the map and draw every 250 m block of the growth or model-year layer as a column, as tall as its rate (what the reader calls 3D); false: back to the flat map. Works with a growth layer, a model-year layer or play_years; census layers stay flat" },
      photo_year: { type: "integer", description: "aerial photograph year (2018, 2019, 2020, 2022, 2023, 2024, 2025) or 0 to hide" },
      focus: { type: "array", items: { type: "object", properties: { level: { type: "string", enum: ["zip", "neighbourhood", "tract", "cell", "block_group", "city"] }, id: { type: "string" } } } },
      highlight: { type: "object", properties: { level: { type: "string", enum: ["zip", "neighbourhood", "tract", "cell", "block_group"] }, ids: { type: "array", items: { type: "string" } } } },
      card: { type: "object", description: "open the numbers card of one area", properties: { level: { type: "string", enum: ["zip", "neighbourhood", "tract", "cell", "block_group"] }, id: { type: "string" } } } } } } },
];

// update_map arguments -> the page's action (src/explore-app.js apply)
const LEVEL: Record<string, string> = { zip: "zips", neighbourhood: "hoods", tract: "tracts", cell: "cells", block_group: "bgs" };
export function mapAction(t: Tables, a: Row) {
  const out: Row = {};
  const L = String(a.layer || "keep");
  if (L === "off") out.layer = "off";
  else if (/^(new|popup|demo)_20\d\d_20\d\d$/.test(L)) { const [k, y0, y1] = L.split("_"); out.layer = { type: "growth", kind: k, period: `${y0}_${y1}` }; }
  else if (L.startsWith("model_")) out.layer = { type: "model", year: L.slice(6) };
  else if (L.startsWith("acs_")) out.layer = { type: "acs", field: L.slice(4), year: a.acs_period === "2015_19" ? "2019" : "2023" };
  if (typeof a.show_zips === "boolean") out.zips = a.show_zips;
  if (typeof a.show_neighbourhoods === "boolean") out.hoods = a.show_neighbourhoods;
  if (typeof a.show_rail === "boolean") out.rail = a.show_rail;
  if (typeof a.show_tracts === "boolean") out.tracts = a.show_tracts;
  if (typeof a.show_street_houses === "boolean") out.street = a.show_street_houses;
  if (typeof a.columns_3d === "boolean") out.tall = a.columns_3d;
  if (a.photo_year === 0) out.photo = false; else if (a.photo_year) out.photo = a.photo_year;
  if (Array.isArray(a.play_years)) {
    const ys = Object.keys(MODEL_YEARS).filter((y) => a.play_years.map(String).includes(y));
    if (ys.length >= 2) { out.play = ys; delete out.layer; }       // the play sets the layer itself
  }
  const fix = (x: Row) => {
    if (!x || !LEVEL[x.level]) return null;
    let id = String(x.id);
    if (x.level === "neighbourhood" && !t.hoods[id]) id = findHood(t, id).match || id;
    if (x.level === "tract") id = tractId(t, id.replace(TRACT_RE, "$1")) || id;
    return { level: LEVEL[x.level], id };
  };
  if (Array.isArray(a.focus)) out.focus = a.focus.some((f: Row) => f && f.level === "city") ? "city" : a.focus.map(fix).filter(Boolean);
  if (a.highlight && Array.isArray(a.highlight.ids) && LEVEL[a.highlight.level]) {
    out.highlight = { level: LEVEL[a.highlight.level], ids: a.highlight.ids.slice(0, 40).map((id: string) => fix({ level: a.highlight.level, id })!.id) };
  }
  if (a.card) { const c = fix(a.card); if (c) out.card = c; }
  // the areas the answer is about are both shown and outlined, whichever of the two the model gave
  if (Array.isArray(out.focus) && out.focus.length && !out.highlight) {
    const lv = out.focus[0].level;
    out.highlight = { level: lv, ids: out.focus.filter((f: Row) => f.level === lv).map((f: Row) => f.id) };
  }
  if (out.highlight && out.highlight.ids.length && !out.focus) out.focus = out.highlight.ids.slice(0, 12).map((id: string) => ({ level: out.highlight.level, id }));
  return out;
}

export function runTool(t: Tables, name: string, args: Row) {
  switch (name) {
    case "lookup_area": return lookupArea(t, args as any);
    case "find_station": return findStation(t, args as any);
    case "rank_stations": return rankStations(t, args as any);
    case "area_stats": return areaStats(t, args as any);
    case "rank_areas": return rankAreas(t, args as any);
    case "citywide": return citywide(t, args as any);
    case "compare_groups": return compareGroups(t, args as any);
    case "update_map": return { ok: true };
    default: return { error: `unknown tool ${name}` };
  }
}

// neighbourhoods and ZIP codes named in the reader's text ("fishtown" -> "Fishtown - Lower Kensington")
export function mentioned(t: Tables, text: string): { level: string; id: string }[] {
  const low = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const out: { level: string; id: string }[] = [];
  for (const z of text.match(/\b191\d\d\b/g) || []) if (t.zips[z]) out.push({ level: "zip", id: z });
  const tm = text.match(TRACT_RE);
  if (tm) { const id = tractId(t, tm[1]); if (id) out.push({ level: "tract", id }); }
  for (const name of Object.keys(t.hoods)) {
    const parts = [name, ...name.split(" - ")].map((x) => x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).filter((x) => x.length > 3);
    if (parts.some((x) => low.includes(` ${x} `))) out.push({ level: "neighbourhood", id: name });
  }
  return out.slice(0, 8);
}
