import "./pages.css";
import { contents, topbar } from "./nav.js";
import { ICONS, LINKS } from "./links.js";
import { v } from "./data.js";

topbar("data-code");
document.getElementById("dc-cta").innerHTML =
  `<a class="btn primary" href="${LINKS.report}" download>${ICONS.download}<span>Download report (PDF)</span></a>
   <a class="btn" href="${LINKS.github}" target="_blank" rel="noopener">${ICONS.github}<span>Code on GitHub</span></a>`;
document.querySelectorAll("img[data-src]").forEach((i) => (i.src = v(i.dataset.src)));   // data URLs carry the build version
contents();
