// Top bar for the explore / method / data & code pages: a Story button back to the cover, and three tabs.
import { ICONS, LINKS } from "./links.js";

const TABS = [["explore", "Explore", LINKS.explore], ["method", "Method", LINKS.method], ["data-code", "Data & Code", LINKS.dataCode]];

export function topbar(active) {
  const bar = document.createElement("header");
  bar.className = "topbar";
  bar.innerHTML = `<a class="btn" href="${LINKS.story}#0">${ICONS.book}<span>Story</span></a>
    <nav class="tabs">${TABS.map(([k, label, href]) =>
      `<a class="tab${k === active ? " on" : ""}" href="${href}"${k === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
  document.body.prepend(bar);
}
