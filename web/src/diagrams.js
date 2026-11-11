// Act 3 diagrams drawn like paper figures: shapes carry the meaning, very little text.
import * as d3 from "d3";
import "d3-transition";   // registers selection.transition(); d3 is marked side-effect free, so the bundler would drop it
import { v } from "./data.js";

const DATA = "/data";
const INK = "#1b2a3a", INK2 = "#4c5966", RULE = "#d6d0c4", SIGNAL = "#ff5a1f", PAPER = "#f1eee8";

// ---------- architecture: what goes in, what comes out ----------
export async function arch(div, { scene, a, b, heightURL }) {
  const s = await (await fetch(v(`${DATA}/scenes/${scene}/scene.json`))).json();
  const svg = d3.select(div).append("svg").attr("viewBox", "0 0 1000 1000");
  svg.append("defs").html(`
    <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 1L9 5L0 9z" fill="${INK2}"/></marker>
    <clipPath id="outclip"><rect x="770" y="395" width="210" height="210"/></clipPath>`);
  const line = (d, dash) => svg.append("path").attr("d", d).attr("fill", "none").attr("stroke", INK2)
    .attr("stroke-width", 2.5).attr("stroke-dasharray", dash || null).attr("marker-end", dash ? null : "url(#ar)");
  const thumb = (x, y, T, src, tag) => {
    svg.append("image").attr("href", src).attr("x", x).attr("y", y).attr("width", T).attr("height", T)
      .attr("preserveAspectRatio", "xMidYMid slice");
    svg.append("rect").attr("x", x).attr("y", y).attr("width", T).attr("height", T).attr("fill", "none")
      .attr("stroke", RULE).attr("stroke-width", 2);
    svg.append("text").attr("x", x + T / 2).attr("y", y + T + 34).attr("text-anchor", "middle").attr("class", "c-label").text(tag);
  };

  // inputs: photo (anchor year), LiDAR height (anchor year), photo (later year)
  const T = 150, top = 230, mid = 425, bot = 620;
  const yt = top + T / 2, ym = mid + T / 2, yb = bot + T / 2;
  thumb(40, top, T, v(`${DATA}/scenes/${scene}/photo_${a}.webp`), `${a}`);
  thumb(40, mid, T, heightURL, `${a} LiDAR`);
  thumb(40, bot, T, v(`${DATA}/scenes/${scene}/photo_${b}.webp`), `${b}`);

  // one DINOv3 encoder (narrowing trapezoid) applied to both photographs: two copies inside one dashed frame.
  // Its last blocks (orange stripe) are fine-tuned; the rest stays as Meta pretrained it.
  svg.append("rect").attr("x", 226).attr("y", 208).attr("width", 178).attr("height", 584).attr("rx", 16)
    .attr("fill", "none").attr("stroke", INK2).attr("stroke-width", 2).attr("stroke-dasharray", "7 7");
  const enc = (yc) => {
    svg.append("path").attr("d", `M240 ${yc - 80}L390 ${yc - 42}V${yc + 42}L240 ${yc + 80}Z`).attr("fill", INK);
    svg.append("path").attr("d", `M364 ${yc - 48.6}L390 ${yc - 42}V${yc + 42}L364 ${yc + 48.6}Z`).attr("fill", SIGNAL);
    svg.append("text").attr("x", 300).attr("y", yc + 10).attr("text-anchor", "middle").attr("class", "c-label")
      .style("fill", "#fff").style("font-size", "27px").text("DINOv3");
  };
  enc(yt);
  enc(yb);
  line(`M${40 + T + 6} ${yt}H236`);
  line(`M${40 + T + 6} ${yb}H236`);
  // what was learned where: a grey bracket under the pretrained body, an orange one from the fine-tuned blocks onward
  const bracket = (x1, x2, col, label) => {
    svg.append("path").attr("d", `M${x1} 868V884H${x2}V868`).attr("fill", "none").attr("stroke", col).attr("stroke-width", 3);
    svg.append("text").attr("x", (x1 + x2) / 2).attr("y", 922).attr("text-anchor", "middle").attr("class", "c-note")
      .style("fill", col === SIGNAL ? "#c2410c" : INK2).style("font-size", "22px").text(label);
  };
  bracket(240, 358, INK2, "pretrained by Meta");
  bracket(366, 980, SIGNAL, "trained on Philadelphia LiDAR");

  // feature tokens: a small grid after each encoder
  const tokens = (yc, seed) => {
    const rng = d3.randomLcg(seed);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      svg.append("rect").attr("x", 410 + i * 21).attr("y", yc - 42 + j * 21).attr("width", 18).attr("height", 18)
        .attr("fill", INK2).attr("opacity", 0.25 + 0.6 * rng());
  };
  tokens(yt, 3);
  tokens(yb, 5);

  // the two feature maps meet in a difference node; the decoder (widening trapezoid) also takes the measured height
  line(`M498 ${yt}C545 ${yt} 530 470 530 482`);
  line(`M498 ${yb}C545 ${yb} 530 530 530 518`);
  svg.append("circle").attr("cx", 530).attr("cy", 500).attr("r", 18).attr("fill", PAPER).attr("stroke", INK2).attr("stroke-width", 2.5);
  svg.append("path").attr("d", "M521 500H539").attr("stroke", INK).attr("stroke-width", 3);
  line("M548 500H566");
  line(`M${40 + T + 6} ${ym + 40}C420 ${ym + 40} 470 560 566 556`);
  svg.append("path").attr("d", "M570 440L720 360V640L570 560Z").attr("fill", "#f6dcd0").attr("stroke", SIGNAL).attr("stroke-width", 3);
  svg.append("text").attr("x", 650).attr("y", 510).attr("text-anchor", "middle").attr("class", "c-label").style("font-size", "26px").text("decoder");

  // output: the later photograph with the buildings the model says grew
  line("M722 500H764");
  svg.append("image").attr("href", v(`${DATA}/scenes/${scene}/photo_${b}.webp`)).attr("x", 770).attr("y", 395)
    .attr("width", 210).attr("height", 210);
  const k = 210 / 1024, out = svg.append("g").attr("clip-path", "url(#outclip)");
  for (const u of s.units) {
    if (!(u.model_new[String(b)] || u.model_new[String(b - 1)])) continue;
    for (const r of u.rings) out.append("polygon").attr("points", r.map(([x, y]) => `${770 + x * k},${395 + y * k}`).join(" "))
      .attr("fill", "rgba(255,90,31,.35)").attr("stroke", SIGNAL).attr("stroke-width", 1.5);
  }
  svg.append("rect").attr("x", 770).attr("y", 395).attr("width", 210).attr("height", 210).attr("fill", "none")
    .attr("stroke", SIGNAL).attr("stroke-width", 3);
  svg.append("rect").attr("x", 825).attr("y", 625).attr("width", 100).attr("height", 46).attr("rx", 23).attr("fill", SIGNAL);
  svg.append("text").attr("x", 875).attr("y", 657).attr("text-anchor", "middle").attr("class", "c-label")
    .style("fill", "#fff").style("font-size", "26px").text("grew");
}

// ---------- training data: each bar is one before/after pair of LiDAR flights ----------
export function data(div, zips) {
  const svg = d3.select(div).append("svg").attr("viewBox", "0 0 1000 1000");
  const x = d3.scaleLinear([2009, 2026], [90, 950]);
  const flights = [2010, 2015, 2018, 2022, 2025];
  const pairs = [[2010, 2015], [2010, 2018], [2010, 2022], [2015, 2018], [2015, 2022], [2018, 2022]];
  const y0 = 120, dy = 46;

  // LiDAR flights: dashed guides with the year on top
  for (const f of flights) {
    svg.append("line").attr("x1", x(f)).attr("x2", x(f)).attr("y1", y0 - 26).attr("y2", y0 + dy * 7 + 10)
      .attr("stroke", f === 2025 ? SIGNAL : RULE).attr("stroke-width", 2).attr("stroke-dasharray", "4 6");
    svg.append("text").attr("x", x(f)).attr("y", y0 - 40).attr("text-anchor", "middle").attr("class", "c-label")
      .style("fill", f === 2025 ? SIGNAL : INK).text(f);
  }
  // six training pairs (ink bars), then the test pair (orange, dotted)
  const bar = (p, q, row, test) => {
    const yy = y0 + row * dy;
    svg.append("line").attr("x1", x(p)).attr("x2", x(p)).attr("y1", yy).attr("y2", yy)
      .attr("stroke", test ? SIGNAL : INK).attr("stroke-width", 12).attr("stroke-linecap", "round")
      .attr("stroke-dasharray", test ? "2 18" : null)
      .transition().delay(120 * row).duration(700).attr("x2", x(q));
    for (const v of [p, q]) svg.append("circle").attr("cx", x(v)).attr("cy", yy).attr("r", 11)
      .attr("fill", test ? PAPER : INK).attr("stroke", test ? SIGNAL : INK).attr("stroke-width", 4);
  };
  pairs.forEach(([p, q], k) => bar(p, q, k, false));
  bar(2022, 2025, 6.6, true);

  const chip = (cx, cy, col, dash, label) => {
    svg.append("line").attr("x1", cx).attr("x2", cx + 60).attr("y1", cy).attr("y2", cy).attr("stroke", col)
      .attr("stroke-width", 12).attr("stroke-linecap", "round").attr("stroke-dasharray", dash);
    svg.append("text").attr("x", cx + 80).attr("y", cy + 10).attr("class", "c-note").style("fill", col).text(label);
  };
  chip(90, 500, INK, null, "training");
  chip(420, 500, SIGNAL, "2 18", "test");

  // map: learning ZIPs first, the sealed test ZIPs drawn on top
  const order = { outside: 0, learning: 1, test: 2 };
  const feats = [...zips.features].sort((p, q) => order[p.properties.role] - order[q.properties.role]);
  const proj = d3.geoMercator().fitExtent([[300, 545], [960, 985]], zips);
  svg.append("g").selectAll("path").data(feats).join("path").attr("d", d3.geoPath(proj))
    .attr("fill", (f) => (f.properties.role === "learning" ? "#c9cdd2" : f.properties.role === "test" ? "#f6dcd0" : "none"))
    .attr("stroke", (f) => (f.properties.role === "test" ? SIGNAL : PAPER))
    .attr("stroke-width", (f) => (f.properties.role === "test" ? 3.5 : 1.5));
  const leg = [["#c9cdd2", "#c9cdd2", "37 ZIP codes learned from"], ["#f6dcd0", SIGNAL, "8 ZIP codes kept for the test"]];
  leg.forEach(([f, s, t], k) => {
    svg.append("rect").attr("x", 90).attr("y", 640 + k * 110).attr("width", 34).attr("height", 34).attr("fill", f)
      .attr("stroke", s).attr("stroke-width", 3);
    svg.append("foreignObject").attr("x", 138).attr("y", 634 + k * 110).attr("width", 170).attr("height", 100)
      .html(`<div class="c-fo">${t}</div>`);
  });
}

// ---------- the whole project on one sheet: what goes in, what was tested, what came out ----------
export function flow(div) {
  const svg = d3.select(div).append("svg").attr("viewBox", "0 0 1000 1000");
  svg.append("defs").html(`<marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
      <path d="M0 1L9 5L0 9z" fill="${INK2}"/></marker>`);
  const KIND = { data: ["#e7e2d8", RULE], step: ["#fbfaf7", INK2], model: ["#f6dcd0", SIGNAL], out: [INK, INK] };
  const box = (x, y, w, h, kind, title, sub) => {
    const [fill, stroke] = KIND[kind];
    svg.append("rect").attr("x", x).attr("y", y).attr("width", w).attr("height", h).attr("rx", 10)
      .attr("fill", fill).attr("stroke", stroke).attr("stroke-width", 2.5);
    svg.append("foreignObject").attr("x", x + 14).attr("y", y + 10).attr("width", w - 28).attr("height", h - 16)
      .html(`<div class="flow-b${kind === "out" ? " inv" : ""}"><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</div>`);
  };
  const arrow = (d, label, lx, ly) => {
    svg.append("path").attr("d", d).attr("fill", "none").attr("stroke", INK2).attr("stroke-width", 2.5).attr("marker-end", "url(#fl)");
    if (label) svg.append("text").attr("x", lx).attr("y", ly).attr("text-anchor", "end").attr("class", "flow-l").text(label);
  };
  const W = 290, H = 132, X = [20, 355, 690], Y = [30, 222, 414, 606, 798];
  // what goes in
  box(X[0], Y[0], W, H, "data", "LiDAR flights", "2018, 2022, 2025. The height of every roof.");
  box(X[1], Y[0], W, H, "data", "Aerial photographs", "Every spring, 0.25 m.");
  box(X[2], Y[0], W, H, "data", "Street views, permits", "House fronts over the years, and what owners applied for.");
  // labels and model
  box(X[0], Y[1], W, H, "step", "Change labels per lot", "New building, added storey, demolition.");
  box(X[1], Y[1], W, H, "model", "Model", "DINOv3 reads two photographs and one height.");
  arrow(`M${X[0] + W / 2} ${Y[0] + H}V${Y[1] - 6}`);
  arrow(`M${X[1] + W / 2} ${Y[0] + H}V${Y[1] - 6}`);
  arrow(`M${X[0] + W} ${Y[1] + H / 2}H${X[1] - 6}`);
  // the sealed test and its two answers
  box(X[1], Y[2], W, H, "step", "One sealed test", "8 ZIP codes and 2022–2025, opened once.");
  arrow(`M${X[1] + W / 2} ${Y[1] + H}V${Y[2] - 6}`);
  box(X[0], Y[3], W, H, "step", "New buildings: passed", "r = 0.96 per block. The model dates them every year.");
  box(X[2], Y[3], W, H, "step", "Added storeys: failed", "r = 0.42 from above. Look from the street instead.");
  arrow(`M${X[1]} ${Y[2] + H / 2}C${X[1] - 60} ${Y[2] + H / 2} ${X[0] + W / 2} ${Y[2] + H} ${X[0] + W / 2} ${Y[3] - 6}`);
  arrow(`M${X[1] + W} ${Y[2] + H / 2}C${X[1] + W + 60} ${Y[2] + H / 2} ${X[2] + W / 2} ${Y[2] + H} ${X[2] + W / 2} ${Y[3] - 6}`);
  // street photographs and permits feed the look from the street
  arrow(`M${X[2] + W - 36} ${Y[0] + H}V${Y[3] - 6}`, "houses to check, photographs", X[2] + W - 48, Y[1] + H + 44);
  // what comes out
  box(X[0], Y[4], W, H, "out", "The city, year by year", "When, where, near rail, by income, against permits.");
  box(X[2], Y[4], W, H, "out", "1,538 houses found", "Four in five right by hand. Counts stay with LiDAR.");
  arrow(`M${X[0] + W / 2} ${Y[3] + H}V${Y[4] - 6}`);
  arrow(`M${X[2] + W / 2} ${Y[3] + H}V${Y[4] - 6}`, "a vision-language model compares them", X[2] + W / 2 - 14, Y[3] + H + 36);
}
