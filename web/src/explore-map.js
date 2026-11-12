// Explore map: MapLibre on an OpenFreeMap basemap with every label layer removed (no street names on the site).
// Data layers are off until the reader or the assistant turns one on. One fill layer at a time (growth cells or a
// census layer); outlines, rail stops and the aerial photograph sit on top or underneath independently.
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { v } from "./data.js";
import { ACS, BLUE, CHANGE, GROWTH, GROWTH_BREAKS, ORANGE, PERIODS, PHOTO_YEARS, STREET, YEARS, YEAR_ORDER, acsBreaks, acsColumn, fmt,
  photoTiles, stepColor } from "./layers.js";

const D = "/data/explore";
const STYLE = "https://tiles.openfreemap.org/styles/positron";
const PAPER = "#f1eee8", INK = "#1b2a3a", SIGNAL = "#ff5a1f";
const MIN_LOTS = 10;                     // cells with fewer covered lots are not coloured (rates would be noise)

export const tables = {};                // id -> record, per level (cells, bgs, zips, hoods) + city
let map, bounds = {}, state = { fill: null, zips: false, hoods: false, tracts: false, rail: false, street: false, photo: null }, onChange = () => {};

const rows = (t) => Object.fromEntries(t.rows.map((r) => [r[0], Object.fromEntries(t.cols.map((c, i) => [c, r[i]]))]));
const json = async (u) => (await fetch(v(u))).json();

async function basemap() {
  const s = await (await fetch(STYLE)).json();
  s.layers = s.layers.filter((l) => l.type !== "symbol").map((l) => {
    if (l.id === "background") l.paint = { "background-color": PAPER };
    if (l.id === "water") l.paint = { ...l.paint, "fill-color": "#d5dde2" };
    if (l.id === "building") l.paint = { ...l.paint, "fill-color": "#e4dfd5", "fill-outline-color": "#dcd6ca" };
    return l;
  });
  return s;
}

function cellFeatures(c) {
  const feats = [];
  const ci = Object.fromEntries(c.cols.map((k, i) => [k, i]));
  c.rows.forEach((r, k) => {
    const p = { id: r[ci.id], units: r[ci.units], hr: r[ci.hr] };
    for (const [per, P] of Object.entries(PERIODS)) {
      const cov = r[ci[`cov${P.short}`]];
      for (const g of Object.values(GROWTH)) {
        const n = r[ci[`${g.key}${P.short}`]];
        p[`${g.key}${P.short}`] = n;
        if (cov >= MIN_LOTS && !p.hr) p[`r_${g.key}${P.short}`] = (n / cov) * 1000 / P.years;
      }
      p[`cov${P.short}`] = cov;
    }
    for (const [y, Y] of YEAR_ORDER.map((y) => [y, YEARS[y]])) {
      const u = r[ci[Y.set]], est = r[ci[`y${y}`]];
      p[`y${y}`] = est;
      if (u >= MIN_LOTS && !p.hr) p[`ry${y}`] = (Math.max(est, 0) / u) * 1000 / Y.years;
    }
    const q = c.corners[k];
    feats.push({ type: "Feature", id: k, properties: p,
      geometry: { type: "Polygon", coordinates: [[[q[0], q[1]], [q[2], q[3]], [q[4], q[5]], [q[6], q[7]], [q[0], q[1]]]] } });
  });
  return { type: "FeatureCollection", features: feats };
}

function bboxOf(geom) {
  let b = [180, 90, -180, -90];
  const walk = (a) => (typeof a[0] === "number" ? (b = [Math.min(b[0], a[0]), Math.min(b[1], a[1]), Math.max(b[2], a[0]), Math.max(b[3], a[1])]) : a.forEach(walk));
  walk(geom.coordinates);
  return b;
}

const union = (bs) => bs.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);

export async function initMap(container, changed) {
  onChange = changed || onChange;
  const [style, cells, t, bgs, zips, hoods, rail, city, tracts, street] = await Promise.all([basemap(), json(`${D}/cells.json`), json(`${D}/tables.json`),
    json(`${D}/bgs.json`), json(`${D}/zips.json`), json(`${D}/hoods.json`), json("/data/results/rail.json"), json(`${D}/city.json`),
    json(`${D}/tracts.json`), json("/data/results/street.json").catch(() => ({ points: [] }))]);
  tables.city = t.city;
  tables.by = t.by;
  for (const k of ["zips", "hoods", "bgs", "cells", "tracts"]) tables[k] = rows(t[k]);
  const cellGeo = cellFeatures(cells);
  for (const [k, fc] of [["cells", cellGeo], ["bgs", bgs], ["zips", zips], ["hoods", hoods], ["tracts", tracts]]) {
    bounds[k] = Object.fromEntries(fc.features.map((f) => [f.properties.id, bboxOf(f.geometry)]));
  }
  bgs.features.forEach((f, i) => { f.id = i; Object.assign(f.properties, tables.bgs[f.properties.id] || {}); });

  map = new maplibregl.Map({ container, style, bounds: union(Object.values(bounds.zips)), fitBoundsOptions: { padding: 30 },
    attributionControl: { compact: true }, maxZoom: 18, minZoom: 9, dragRotate: false, pitchWithRotate: false });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  await new Promise((res) => map.on("load", res));

  map.addSource("cells", { type: "geojson", data: cellGeo });
  map.addSource("bgs", { type: "geojson", data: bgs });
  map.addSource("zips", { type: "geojson", data: zips });
  map.addSource("hoods", { type: "geojson", data: hoods });
  map.addSource("tracts", { type: "geojson", data: tracts });
  map.addSource("rail", { type: "geojson", data: { type: "FeatureCollection",
    features: rail.map((c) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } })) } });
  map.addSource("street", { type: "geojson", data: { type: "FeatureCollection",
    features: street.points.map((c) => ({ type: "Feature", properties: { p: c[2] }, geometry: { type: "Point", coordinates: [c[0], c[1]] } })) } });
  const labelPoints = (fc) => ({ type: "FeatureCollection", features: fc.features.map((f) => {
    const b = bboxOf(f.geometry);
    return { type: "Feature", properties: { id: f.properties.id }, geometry: { type: "Point", coordinates: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] } };
  }) });
  map.addSource("zip-labels", { type: "geojson", data: labelPoints(zips) });
  map.addSource("hood-labels", { type: "geojson", data: labelPoints(hoods) });
  map.addSource("tract-labels", { type: "geojson", data: labelPoints(tracts) });

  const none = { visibility: "none" };
  map.addLayer({ id: "photo", type: "raster", source: { type: "raster", tiles: [photoTiles(2025)], tileSize: 256, maxzoom: 20,
    attribution: "Aerial photography: City of Philadelphia" }, layout: none, paint: { "raster-opacity": 0.95 } });
  // paper outside the city while the photograph is on (the tile service is dark grey where it has no imagery)
  const holes = city.features[0].geometry.type === "Polygon" ? [city.features[0].geometry.coordinates[0]]
    : city.features[0].geometry.coordinates.map((p) => p[0]);
  map.addSource("mask", { type: "geojson", data: { type: "Feature", properties: {},
    geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...holes] } } });
  map.addLayer({ id: "mask", type: "fill", source: "mask", layout: none, paint: { "fill-color": PAPER, "fill-opacity": 1 } });
  map.addLayer({ id: "bg-fill", type: "fill", source: "bgs", layout: none, paint: { "fill-opacity": 0.78 } });
  map.addLayer({ id: "bg-line", type: "line", source: "bgs", layout: none, paint: { "line-color": PAPER, "line-width": 0.6 } });
  map.addLayer({ id: "cell-fill", type: "fill", source: "cells", layout: none, paint: { "fill-opacity": 0.85 } });
  map.addLayer({ id: "hood-hit", type: "fill", source: "hoods", paint: { "fill-opacity": 0 } });
  map.addLayer({ id: "hood-line", type: "line", source: "hoods", layout: none, paint: { "line-color": "#6b7480", "line-width": 1, "line-dasharray": [3, 2] } });
  map.addLayer({ id: "tract-hit", type: "fill", source: "tracts", layout: none, paint: { "fill-opacity": 0 } });
  map.addLayer({ id: "tract-line", type: "line", source: "tracts", layout: none, paint: { "line-color": "#4c5966", "line-width": 0.9, "line-dasharray": [1, 2] } });
  map.addLayer({ id: "zip-line", type: "line", source: "zips", layout: none, paint: { "line-color": INK, "line-width": 1.2 } });
  map.addLayer({ id: "rail", type: "circle", source: "rail", layout: none,
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 5], "circle-color": "#3f4650", "circle-stroke-color": PAPER, "circle-stroke-width": 1 } });
  map.addLayer({ id: "street", type: "circle", source: "street", layout: none,
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.2, 14, 4.5, 17, 9],
      "circle-color": ["match", ["get", "p"], 0, STREET.colors[0], 1, STREET.colors[1], STREET.colors[2]],
      "circle-stroke-color": PAPER, "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 15, 1.4] } });
  for (const [k, src] of [["cells", "cells"], ["bgs", "bgs"], ["zips", "zips"], ["hoods", "hoods"], ["tracts", "tracts"]]) {
    map.addLayer({ id: `hl-${k}`, type: "line", source: src, filter: ["in", ["get", "id"], ["literal", []]],
      paint: { "line-color": SIGNAL, "line-width": k === "cells" ? 2.4 : 3 } });
  }
  const label = (id, src, size) => map.addLayer({ id, type: "symbol", source: src, layout: { ...none, "text-field": ["get", "id"],
    "text-font": ["Noto Sans Regular"], "text-size": size, "text-allow-overlap": false },
    paint: { "text-color": INK, "text-halo-color": PAPER, "text-halo-width": 1.6 } });
  label("zip-label", "zip-labels", 13);
  label("hood-label", "hood-labels", 12);
  label("tract-label", "tract-labels", 11);
  map.setLayoutProperty("tract-label", "text-field", ["concat", "CT ", ["get", "id"]]);
  map.setLayerZoomRange("tract-label", 12.5, 24);
  map.setLayoutProperty("hood-label", "text-font", ["Noto Sans Italic"]);
  map.setLayerZoomRange("hood-label", 12, 24);

  // a dot of the street layer says when the change first shows (no address, no photograph)
  const tip = new maplibregl.Popup({ closeButton: false, offset: 10, className: "street-tip" });
  map.on("click", "street", (e) => {
    const f = e.features[0];
    tip.setLngLat(f.geometry.coordinates).setHTML(`<b>Seen taller from the street</b><br>first in the ${STREET.periods[f.properties.p]} photographs`).addTo(map);
    e.originalEvent.streetDot = true;
  });
  map.on("mouseenter", "street", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "street", () => (map.getCanvas().style.cursor = ""));
  map.on("click", (e) => {
    if (e.originalEvent.streetDot) return;
    let f;
    for (const l of ["cell-fill", "bg-fill", "tract-hit", "hood-hit"]) {
      if (!visible(l)) continue;
      f = map.queryRenderedFeatures(e.point, { layers: [l] })[0];
      if (f) break;
    }
    if (!f) return;
    const kind = f.layer.id === "cell-fill" ? "cells" : f.layer.id === "bg-fill" ? "bgs" : f.layer.id === "tract-hit" ? "tracts" : "hoods";
    onChange({ type: "select", level: kind, id: f.properties.id });
    highlight(kind, [f.properties.id]);
  });
  for (const l of ["cell-fill", "bg-fill"]) {
    map.on("mouseenter", l, () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", l, () => (map.getCanvas().style.cursor = ""));
  }
  return map;
}

const visible = (l) => map.getLayoutProperty(l, "visibility") !== "none";
const show = (l, on) => map.setLayoutProperty(l, "visibility", on ? "visible" : "none");

// fill: {type: "growth", kind: new|popup|demo, period} | {type: "model", year} | {type: "acs", field, year: "2019"|"2023"} | null
export function setState(next) {
  state = { ...state, ...next };
  const f = state.fill;
  show("cell-fill", f && f.type !== "acs");
  show("bg-fill", f && f.type === "acs");
  show("bg-line", f && f.type === "acs");
  if (f && f.type === "growth") {
    const col = `r_${GROWTH[f.kind].key}${PERIODS[f.period].short}`;
    map.setPaintProperty("cell-fill", "fill-color", ["case", ["!", ["has", col]], "rgba(0,0,0,0)", ["==", ["get", col], 0], state.photo ? "rgba(0,0,0,0)" : "rgba(231,226,216,.55)",
      stepColor(["get", col], GROWTH_BREAKS, ORANGE)]);
  } else if (f && f.type === "model") {
    const col = `ry${f.year}`;
    map.setPaintProperty("cell-fill", "fill-color", ["case", ["!", ["has", col]], "rgba(0,0,0,0)", ["<", ["get", col], 0.05], state.photo ? "rgba(0,0,0,0)" : "rgba(231,226,216,.55)",
      stepColor(["get", col], GROWTH_BREAKS, ORANGE)]);
  } else if (f && f.type === "acs") {
    const col = acsColumn(f.field, f.year), A = ACS[f.field];
    map.setPaintProperty("bg-fill", "fill-color", ["case", ["==", ["typeof", ["get", col]], "number"],
      stepColor(["get", col], acsBreaks(f.field), A.kind === "change" ? CHANGE : BLUE), "rgba(0,0,0,0)"]);
  }
  show("zip-line", state.zips); show("zip-label", state.zips);
  show("hood-line", state.hoods); show("hood-label", state.hoods);
  show("tract-line", state.tracts); show("tract-label", state.tracts); show("tract-hit", state.tracts);
  show("rail", state.rail);
  show("street", state.street);
  if (state.photo) {
    const src = map.getSource("photo");
    src.setTiles([photoTiles(state.photo)]);
  }
  show("photo", !!state.photo);
  show("mask", !!state.photo);
  map.setPaintProperty("cell-fill", "fill-opacity", state.photo ? 0.6 : 0.85);
  map.setPaintProperty("bg-fill", "fill-opacity", state.photo ? 0.5 : 0.78);
  onChange({ type: "state", state });
}

export const getState = () => state;

export function highlight(level, ids) {
  for (const k of ["cells", "bgs", "zips", "hoods", "tracts"]) map.setFilter(`hl-${k}`, ["in", ["get", "id"], ["literal", k === level ? ids : []]]);
}

// fly to areas: [{level, id}] (unknown ids are skipped); returns false if nothing was found
export function focus(areas, opts = {}) {
  const bs = areas.map((a) => bounds[a.level] && bounds[a.level][a.id]).filter(Boolean);
  if (!bs.length) return false;
  const cam = map.cameraForBounds(union(bs), { padding: 60 });
  if (!cam) return false;
  map.flyTo({ center: cam.center, zoom: Math.min(cam.zoom, opts.maxZoom || 13.5), duration: 1600, essential: true });
  return true;
}

export function whole() {
  map.fitBounds(union(Object.values(bounds.zips)), { padding: 30, duration: 1400 });
}

export const known = (level, id) => !!(bounds[level] && bounds[level][id]);
export { PHOTO_YEARS, fmt };
export const getMap = () => map;
