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

// ---------- research workflow: four stages left to right, each step a card with a small picture ----------
export function flow(div) {
  const svg = d3.select(div).append("svg").attr("viewBox", "0 0 1000 640");
  svg.append("defs").html(`<marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
      <path d="M0 1L9 5L0 9z" fill="${INK}"/></marker>`);
  const PX = [8, 258, 508, 758], PW = 234, CW = 210, CH = 156, TH = 92, R = [64, 244, 424];
  ["Data", "Learning", "Test", "Results"].forEach((t, k) => {
    svg.append("rect").attr("x", PX[k]).attr("y", 8).attr("width", PW).attr("height", 624).attr("rx", 12).attr("fill", "#f4f1eb");
    svg.append("circle").attr("cx", PX[k] + 26).attr("cy", 36).attr("r", 13).attr("fill", INK);
    svg.append("text").attr("x", PX[k] + 26).attr("y", 42).attr("text-anchor", "middle").attr("class", "flow-n").text(k + 1);
    svg.append("text").attr("x", PX[k] + 48).attr("y", 43).attr("class", "flow-h").text(t);
  });
  // a card: picture (an image, or a drawing made by `draw`) over a title and one line
  // every card is a link to the section of the page that describes it
  let svgRoot = svg;
  const card = (col, row, title, sub, pic, hot, href) => {
    const x = PX[col] + 12, y = R[row], id = `fc${col}${row}`;
    const svg = href ? svgRoot.append("a").attr("href", href).attr("class", "flow-a") : svgRoot;
    svg.append("clipPath").attr("id", id).append("path")
      .attr("d", `M${x} ${y + TH}V${y + 8}a8 8 0 0 1 8 -8H${x + CW - 8}a8 8 0 0 1 8 8V${y + TH}Z`);
    svg.append("rect").attr("x", x).attr("y", y).attr("width", CW).attr("height", CH).attr("rx", 8).attr("fill", "#fffdf9");
    const g = svg.append("g").attr("clip-path", `url(#${id})`);
    g.append("rect").attr("x", x).attr("y", y).attr("width", CW).attr("height", TH).attr("fill", "#e7e2d8");
    if (typeof pic === "string") g.append("image").attr("href", v(pic)).attr("x", x).attr("y", y + (TH - CW) / 2)
      .attr("width", CW).attr("height", CW).attr("preserveAspectRatio", "xMidYMid slice");
    else pic(g, x, y);
    svg.append("rect").attr("x", x).attr("y", y).attr("width", CW).attr("height", CH).attr("rx", 8).attr("fill", "none")
      .attr("stroke", hot ? SIGNAL : "#cfc8ba").attr("stroke-width", hot ? 2.5 : 1.5);
    svg.append("text").attr("x", x + 12).attr("y", y + TH + 28).attr("class", "flow-t").text(title);
    svg.append("text").attr("x", x + 12).attr("y", y + TH + 50).attr("class", "flow-s").text(sub);
    return { l: x, r: x + CW, t: y, b: y + CH, cx: x + CW / 2, cy: y + CH / 2 };
  };
  const arrow = (d) => svg.append("path").attr("d", d).attr("fill", "none").attr("stroke", INK).attr("stroke-width", 2)
    .attr("marker-end", "url(#fl)");
  const note = (x, y, t, anchor = "middle") => svg.append("text").attr("x", x).attr("y", y).attr("text-anchor", anchor).attr("class", "flow-l").text(t);

  // drawings for the cards that have no photograph
  const model = (g, x, y) => {
    for (const dy of [26, 66]) {
      g.append("path").attr("d", `M${x + 30} ${y + dy - 16}L${x + 84} ${y + dy - 8}V${y + dy + 8}L${x + 30} ${y + dy + 16}Z`).attr("fill", INK);
      g.append("path").attr("d", `M${x + 74} ${y + dy - 9.5}L${x + 84} ${y + dy - 8}V${y + dy + 8}L${x + 74} ${y + dy + 9.5}Z`).attr("fill", SIGNAL);
      g.append("path").attr("d", `M${x + 88} ${y + dy}H${x + 112}`).attr("stroke", INK2).attr("stroke-width", 2);
    }
    g.append("path").attr("d", `M${x + 116} ${y + 34}L${x + 180} ${y + 14}V${y + 78}L${x + 116} ${y + 58}Z`).attr("fill", "#f6dcd0").attr("stroke", SIGNAL).attr("stroke-width", 2);
  };
  const test = (g, x, y) => {
    [["new buildings", "0.96", true], ["added storeys", "0.42", false]].forEach(([t, r, ok], k) => {
      const yy = y + 12 + k * 38;
      g.append("rect").attr("x", x + 12).attr("y", yy).attr("width", CW - 24).attr("height", 30).attr("rx", 15)
        .attr("fill", ok ? INK : "#fffdf9").attr("stroke", ok ? INK : SIGNAL).attr("stroke-width", 2);
      g.append("text").attr("x", x + 26).attr("y", yy + 21).attr("class", "flow-c").style("fill", ok ? "#fff" : "#c2410c").text(t);
      g.append("text").attr("x", x + CW - 26).attr("y", yy + 21).attr("text-anchor", "end").attr("class", "flow-c")
        .style("fill", ok ? "#fff" : "#c2410c").style("font-weight", 600).text(r);
    });
  };
  const bars = (g, x, y) => {
    [1.8, 2.3, 1.3, 1.0, 1.4, 1.3].forEach((val, k) => g.append("rect").attr("x", x + 30 + k * 26).attr("width", 18)
      .attr("y", y + 82 - val * 28).attr("height", val * 28).attr("fill", [2, 5].includes(k) ? INK : SIGNAL));
  };

  const lidar = card(0, 0, "LiDAR", "2018, 2022, 2025", "/data/scenes/s2/iso_2022_clay.webp", false, "#s1");
  const aerial = card(0, 1, "Aerial photographs", "every spring", "/data/scenes/s2/photo_2022.webp", false, "#s1");
  const street = card(0, 2, "Street views, permits", "2007 to 2026", "/data/street/a_2016.webp", false, "#s8");
  const labels = card(1, 0, "Change labels", "per lot, from LiDAR", "/data/scenes/s3/iso_2025_new.webp", false, "#s2");
  const mod = card(1, 1, "Change model", "DINOv3, two photographs", model, true, "#s3");
  const exam = card(2, 1, "Sealed test", "r per block, run once", test, false, "#s6");
  const city = card(3, 0, "New buildings by year", "when, where, rail, income", bars, false, "#s9");
  const found = card(3, 2, "1,538 houses found", "Gemini 3.8 Flash", "/data/street/a_2019.webp", true, "#s8");

  arrow(`M${lidar.r + 4} ${lidar.cy}H${labels.l - 5}`);
  arrow(`M${labels.cx} ${labels.b + 4}V${mod.t - 5}`);
  arrow(`M${aerial.r + 4} ${aerial.cy}H${mod.l - 5}`);
  arrow(`M${mod.r + 4} ${mod.cy}H${exam.l - 5}`);
  arrow(`M${exam.cx} ${exam.t - 4}V${city.cy}H${city.l - 5}`);
  arrow(`M${exam.cx} ${exam.b + 4}V${found.cy - 20}H${found.l - 5}`);
  arrow(`M${street.r + 4} ${street.cy + 26}H${found.l - 5}`);
  note(exam.cx + 10, city.cy + 26, "passed", "start");
  note(exam.cx + 10, found.cy - 30, "failed", "start");
}

// ---------- the path to the final model: what each attempt did, and its score where it has one ----------
export function attempts(div) {
  const svg = d3.select(div).append("svg").attr("viewBox", "0 0 1000 610");
  const rows = [
    { t: "One photograph, height", note: "finds 44% of added storeys" },
    { t: "Two photographs, height change", note: "answers no change everywhere" },
    { t: "Two photographs and measured height", note: "copies the measured height" },
    { t: "A score for every lot, 7 ZIP codes", g: 0.78, p: 0.31 },
    { t: "Whole city, first recipe", g: 0.72, p: 0.12, note: "4 of 6 runs died" },
    { t: "Whole city, final recipe", g: 0.80, p: 0.43, hot: true },
    { t: "Sealed test, unseen places and years", g: 0.68, p: 0.15, test: true },
  ];
  const X0 = 430, W = 380, x = d3.scaleLinear([0, 1], [0, W]), H = 74, Y0 = 70;
  svg.append("rect").attr("x", X0 - 8).attr("y", 26).attr("width", 18).attr("height", 18).attr("fill", INK);
  svg.append("text").attr("x", X0 + 18).attr("y", 41).attr("class", "flow-s").text("any growth");
  svg.append("rect").attr("x", X0 + 130).attr("y", 26).attr("width", 18).attr("height", 18).attr("fill", SIGNAL);
  svg.append("text").attr("x", X0 + 156).attr("y", 41).attr("class", "flow-s").text("added storeys");
  rows.forEach((r, k) => {
    const y = Y0 + k * H + (r.test ? 18 : 0);
    if (r.test) svg.append("line").attr("x1", 20).attr("x2", 980).attr("y1", y - 14).attr("y2", y - 14).attr("stroke", RULE).attr("stroke-width", 2);
    svg.append("circle").attr("cx", 36).attr("cy", y + 26).attr("r", 15).attr("fill", r.hot ? SIGNAL : r.test ? INK : "#fffdf9")
      .attr("stroke", r.hot ? SIGNAL : INK).attr("stroke-width", 2);
    svg.append("text").attr("x", 36).attr("y", y + 32).attr("text-anchor", "middle").attr("class", "flow-n")
      .style("fill", r.hot || r.test ? "#fff" : INK).text(r.test ? "T" : k + 1);
    svg.append("text").attr("x", 64).attr("y", y + 32).attr("class", "flow-t").text(r.t);
    if (r.g != null) {
      [[r.g, INK, 8], [r.p, SIGNAL, 32]].forEach(([val, col, dy]) => {
        svg.append("rect").attr("x", X0).attr("y", y + dy).attr("height", 18).attr("width", 0).attr("fill", col)
          .transition().delay(150 * k).duration(700).attr("width", x(val));
        svg.append("text").attr("x", X0 + x(val) + 8).attr("y", y + dy + 15).attr("class", "flow-s").style("fill", INK).text(val.toFixed(2));
      });
      if (r.note) svg.append("text").attr("x", 980).attr("y", y + 32).attr("text-anchor", "end").attr("class", "flow-l").text(r.note);
    } else {
      svg.append("text").attr("x", X0).attr("y", y + 32).attr("class", "flow-l").text(r.note);
    }
  });
}
