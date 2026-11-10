// Opening shot: Center City to Point Breeze from above, flying down to one block.
// Layers (wide, 4 km, 1 km, block) are placed in metres relative to the block centre (east, north) and drawn
// coarse to fine; each fades in once the view is inside it.

import { v } from "./data.js";

const DATA = "/data";
let layers = null, canvas = null, view = null, anim = null;

export async function initZoom(el) {
  canvas = el;
  // no-cache + version stamps: a re-exported layer can never be replaced by a stale copy
  const meta = await (await fetch(`${DATA}/hero/layers.json`, { cache: "no-cache" })).json();
  // the wide layer is all the cover needs: draw as soon as it arrives; the zoom layers follow at low priority
  layers = meta.layers.map((l, k) => {
    const img = new Image();
    img.decoding = "async";
    img.fetchPriority = k === 0 ? "high" : "low";
    img.onload = () => { if (!anim) draw(); };
    // the block is the story's own 2025 photo: same URL as the story uses, so it is downloaded once
    img.src = l.src.startsWith("scenes/") ? v(`${DATA}/${l.src}`) : `${DATA}/${l.src}?v=${l.v ?? 0}`;
    // a small copy of the wide layer arrives first and is drawn until the full one has loaded
    let pre = null;
    if (l.preview) {
      pre = new Image();
      pre.fetchPriority = "high";
      pre.onload = () => { if (!anim) draw(); };
      pre.src = `${DATA}/${l.preview}?v=${l.v ?? 0}`;
    }
    return { ...l, img, pre };
  });
  view = heroView();
  draw();
  addEventListener("resize", () => { if (!anim) draw(); });
}

// framed like a postcard: the river, Center City and 30th Street up top, the block to the south
function heroView() {
  const wide = layers[0];
  return { x: wide.dx_m, y: wide.dy_m + 250, span: 4300 };   // span: metres across the shorter side
}
const blockView = () => ({ x: 0, y: 0, span: 256 });

const clamp = (v) => Math.max(0, Math.min(1, v));

function draw() {
  if (!layers) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const { width: W, height: H } = canvas.getBoundingClientRect();
  if (!W || !H) return;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#f1eee8";
  g.fillRect(0, 0, W, H);
  g.imageSmoothingQuality = "high";
  const mpp = view.span / Math.min(W, H);
  for (const [k, l] of layers.entries()) {
    // the wide layer is always there; zoom layers fade in once the view is inside them (so their square edges never
    // show); the block fades in over the last doubling so it fills the square frame at the end
    const last = k === layers.length - 1;
    const a = k === 0 ? 1 : last ? clamp((2 * l.side_m - view.span) / (0.95 * l.side_m))
      : clamp((l.side_m - view.span) / (0.45 * l.side_m));
    const pic = l.img.naturalWidth ? l.img : l.pre?.naturalWidth ? l.pre : null;
    if (a <= 0 || !pic) continue;
    const x0 = (l.dx_m - l.side_m / 2 - view.x) / mpp + W / 2;
    const y0 = (view.y - (l.dy_m + l.side_m / 2)) / mpp + H / 2;
    const s = l.side_m / mpp;
    if (x0 > W || y0 > H || x0 + s < 0 || y0 + s < 0) continue;
    g.globalAlpha = a;
    g.drawImage(pic, x0, y0, s, s);
  }
  g.globalAlpha = 1;
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function run(dur, frame) {
  cancelAnimationFrame(anim);
  const t0 = performance.now();
  return new Promise((done) => {
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      frame(k);
      draw();
      if (k < 1) anim = requestAnimationFrame(tick);
      else { anim = null; done(); }
    };
    anim = requestAnimationFrame(tick);
  });
}

// keep redrawing the current view while the frame changes size (layout transition)
export const hold = (dur) => run(dur, () => {});

// fly between the opening view and the block view
export function fly(toBlock, dur = 2400) {
  if (!layers) return Promise.resolve();
  const a = toBlock ? heroView() : blockView(), b = toBlock ? blockView() : heroView();
  return run(dur, (k) => {
    const e = ease(k);
    const span = Math.exp(Math.log(a.span) + (Math.log(b.span) - Math.log(a.span)) * e);
    // move the centre in step with the zoom so the flight feels anchored on the block
    const f = (a.span - span) / (a.span - b.span);
    view = k === 1 ? b : { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, span };
  });
}

export function showBlock() { if (layers) { view = blockView(); draw(); } }
export function showHero() { if (layers) { view = heroView(); draw(); } }
