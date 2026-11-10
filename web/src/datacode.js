import "./pages.css";
import { topbar } from "./nav.js";
import { ICONS, LINKS } from "./links.js";

topbar("data-code");
document.getElementById("dc-cta").innerHTML =
  `<a class="btn primary" href="${LINKS.report}" download>${ICONS.download}<span>Download report (PDF)</span></a>
   <a class="btn" href="${LINKS.github}" target="_blank" rel="noopener">${ICONS.github}<span>Code on GitHub</span></a>`;
