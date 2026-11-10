// LiDAR height images: decode the grey PNG (0.1 m per level) into the site's paper-to-ink ramp.
import { v } from "./data.js";

const DATA = "/data/scenes";
const PAPER = [241, 238, 232], INK = [27, 42, 58];
const heights = {};   // `${id}_${year}_${full}` -> ImageData

// resolves when the image has loaded (load event rather than decode(), which can stall on an unpainted page)
export const loaded = (img) => new Promise((res) => {
  if (img.complete && img.naturalWidth) return res();
  img.addEventListener("load", () => res(), { once: true });
  img.addEventListener("error", () => res(), { once: true });
});

export async function heightImage(id, year, full = 160) {
  const key = `${id}_${year}_${full}`;
  if (heights[key]) return heights[key];
  const img = new Image();
  img.src = v(`${DATA}/${id}/height_${year}.png`);
  await loaded(img);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const h = d.data[i];                       // 0.1 m per level, 0 = no data
    const t = Math.min(1, h / full);           // 0..full/10 m -> paper..ink
    for (let k = 0; k < 3; k++) d.data[i + k] = PAPER[k] + (INK[k] - PAPER[k]) * t;
    d.data[i + 3] = h === 0 ? 0 : 255;
  }
  return (heights[key] = d);
}

// the same ramp on an opaque paper sheet, as a data URL (for <img> and SVG <image>)
export async function heightURL(id, year, full = 160) {
  const d = await heightImage(id, year, full), c = document.createElement("canvas");
  c.width = d.width; c.height = d.height;
  const g = c.getContext("2d"), tmp = document.createElement("canvas");
  tmp.width = d.width; tmp.height = d.height;
  tmp.getContext("2d").putImageData(d, 0, 0);
  g.fillStyle = "#f1eee8";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(tmp, 0, 0);
  return c.toDataURL();
}
