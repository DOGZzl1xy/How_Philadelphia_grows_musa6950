import "./pages.css";
import { contents, topbar } from "./nav.js";
import { drawChart } from "./model.js";
import { heightURL } from "./height.js";
import { v } from "./data.js";

topbar("method");
document.querySelectorAll("img[data-src]").forEach((i) => (i.src = v(i.dataset.src)));   // data URLs carry the build version

// the story draws every chart in a 1000 x 1000 square; here the empty bands are cut off (matches pages.css)
const CROP = { arch: "0 170 1000 790", backbones: "0 0 1000 945", street: "0 60 1000 880", flow: "0 0 1000 640" };

// draw each figure when it scrolls into view, so its animation plays where the reader is
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    io.unobserve(e.target);
    const name = e.target.dataset.chart;
    const opts = name === "arch" ? heightURL("s2", 2018).then((h) => ({ scene: "s2", a: 2018, b: 2020, heightURL: h }))
      : Promise.resolve({});
    opts.then((o) => drawChart(e.target, name, o)).then(() => {
      if (CROP[name]) e.target.querySelector("svg")?.setAttribute("viewBox", CROP[name]);
    });
  }
}, { rootMargin: "0px 0px -15% 0px" });
document.querySelectorAll(".fig[data-chart]").forEach((f) => io.observe(f));

contents();
