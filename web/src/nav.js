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

// contents beside the text on wide windows: one line per section heading with an id, the one being read marked
export function contents() {
  const heads = [...document.querySelectorAll(".doc h2[id]")];
  if (!heads.length) return;
  const toc = document.createElement("nav");
  toc.className = "toc";
  toc.setAttribute("aria-label", "Sections");
  toc.innerHTML = heads.map((h) => `<a href="#${h.id}">${h.textContent.replace(/^\d+\.\s*/, "")}</a>`).join("");
  document.body.append(toc);
  const mark = () => {
    let cur = heads[0];
    for (const h of heads) if (h.getBoundingClientRect().top < 140) cur = h;
    toc.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${cur.id}`));
  };
  addEventListener("scroll", mark, { passive: true });
  mark();
}
