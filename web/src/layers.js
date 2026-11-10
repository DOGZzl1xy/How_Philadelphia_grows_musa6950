// Explore map layers: one catalogue shared by the layer panel, the legend, the area card and the assistant's map
// actions (the Worker sends layer ids from this file). Growth is orange (measured or estimated from imagery),
// census context is ink blue, so the two never read as the same thing.

export const PERIODS = { "2018_2022": { label: "2018–2022", short: "18", years: 4 }, "2022_2025": { label: "2022–2025", short: "22", years: 3 } };
// keys are strings and the order is kept by YEAR_ORDER (JS objects list integer-like keys first)
export const YEARS = {
  2019: { label: "2019", years: 1, set: "au" }, 2020: { label: "2020", years: 1, set: "au" },
  "2021_22": { label: "2021–22", years: 2, set: "au", residual: true },
  2023: { label: "2023", years: 1, set: "bu" }, 2024: { label: "2024", years: 1, set: "bu" },
  2025: { label: "2025", years: 1, set: "bu", residual: true },
};
export const YEAR_ORDER = ["2019", "2020", "2021_22", "2023", "2024", "2025"];
export const PHOTO_YEARS = [2018, 2019, 2020, 2022, 2023, 2024, 2025];
const PHOTO_SERVICE = { 2018: "CityImagery_2018_3in", 2019: "CityImagery_2019_3in", 2020: "CityImagery_2020_3in",
  2022: "CityImagery_2022_2in", 2023: "CityImagery_2023", 2024: "CityImagery_2024_3in", 2025: "CityImagery_2025_3in" };
export const photoTiles = (y) =>
  `https://tiles.arcgis.com/tiles/fLeGjb7u4uXqeF9q/arcgis/rest/services/${PHOTO_SERVICE[y]}/MapServer/tile/{z}/{y}/{x}`;

export const ORANGE = ["#f9e0d3", "#f6c9b4", "#f0a27f", "#e2714a", "#c94a1d", "#9e3208"];
export const BLUE = ["#e6eaee", "#c6d0da", "#9fb0c1", "#7489a0", "#4d6580", "#2c4561"];
// change layers: decline in warm grey, rise in ink blue (orange stays reserved for growth)
export const CHANGE = ["#8c6d4f", "#c9b29a", "#e9e6df", "#c6d0da", "#7489a0", "#2c4561"];

// cell layers: value per 1,000 lots per year
export const GROWTH = {
  new: { label: "New buildings", note: "Measured by LiDAR", key: "n" },
  popup: { label: "Added storeys", note: "Measured by LiDAR; the model cannot see these", key: "p" },
  demo: { label: "Demolitions", note: "Measured by LiDAR", key: "d" },
};
export const GROWTH_BREAKS = [0.5, 2, 5, 10, 20];                // per 1,000 lots per year

// block-group census layers (ACS 5-year). kind: share (0-1), money, change (ratio - 1)
export const ACS = {
  inc: { label: "Median household income", kind: "money", years: true, breaks: [30000, 45000, 60000, 80000, 110000] },
  inc_chg: { label: "Real income change, 2015–19 to 2019–23", kind: "change", breaks: [-0.2, -0.05, 0.05, 0.2, 0.5] },
  pop_chg: { label: "Population change, 2015–19 to 2019–23", kind: "change", breaks: [-0.2, -0.05, 0.05, 0.2, 0.5] },
  rent: { label: "Median gross rent", kind: "money", years: true, breaks: [800, 1000, 1200, 1500, 1900] },
  renter: { label: "Renter households", kind: "share", years: true },
  vacant: { label: "Vacant homes", kind: "share", years: true, breaks: [0.05, 0.1, 0.15, 0.2, 0.3] },
  built2010: { label: "Homes built 2010 or later", kind: "share", years: true, breaks: [0.02, 0.05, 0.1, 0.2, 0.35] },
  pre1940: { label: "Homes built before 1940", kind: "share", years: true },
  black: { label: "Black, not Hispanic", kind: "share", years: true },
  white: { label: "White, not Hispanic", kind: "share", years: true },
  hispanic: { label: "Hispanic or Latino", kind: "share", years: true },
  asian: { label: "Asian, not Hispanic", kind: "share", years: true, breaks: [0.02, 0.05, 0.1, 0.2, 0.35] },
  transit: { label: "Commute by public transit", kind: "share", years: true, breaks: [0.1, 0.2, 0.3, 0.4, 0.5] },
  walk: { label: "Commute on foot or by bike", kind: "share", years: true, breaks: [0.05, 0.1, 0.2, 0.3, 0.45] },
  car: { label: "Commute by car", kind: "share", years: true },
  wfh: { label: "Work from home", kind: "share", years: true, breaks: [0.05, 0.1, 0.15, 0.25, 0.35] },
};
const SHARE_BREAKS = [0.2, 0.35, 0.5, 0.65, 0.8];
export const acsBreaks = (f) => ACS[f].breaks || SHARE_BREAKS;
export const acsColumn = (f, y) => (ACS[f].years ? `${f}${y === "2019" ? "19" : "23"}` : f);

export function fmt(kind, v) {
  if (v == null || Number.isNaN(v)) return "–";
  if (kind === "share") return `${Math.round(v * 100)}%`;
  if (kind === "money") return `$${Math.round(v).toLocaleString("en-US")}`;
  if (kind === "change") return `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
  if (kind === "rate") return v.toFixed(v < 10 ? 1 : 0);
  return v.toLocaleString("en-US");
}

// MapLibre step expression for a value with breaks and colours (colours.length === breaks.length + 1)
export function stepColor(value, breaks, colors) {
  const e = ["step", value, colors[0]];
  breaks.forEach((b, i) => e.push(b, colors[i + 1]));
  return e;
}
