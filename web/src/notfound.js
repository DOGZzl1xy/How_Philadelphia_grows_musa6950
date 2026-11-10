// 404 page (served by Cloudflare for unknown paths, see wrangler.jsonc): the two ways into the site.
import "./pages.css";
import { ICONS, LINKS } from "./links.js";
import { topbar } from "./nav.js";

topbar("");
document.getElementById("cta").innerHTML = `<a class="btn primary" href="${LINKS.story}#0">${ICONS.book}<span>Story</span></a>
  <a class="btn" href="${LINKS.explore}">${ICONS.search}<span>Explore</span></a>`;
