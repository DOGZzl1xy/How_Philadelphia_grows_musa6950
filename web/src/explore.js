import "./pages.css";
import "./explore.css";
import { topbar } from "./nav.js";
import { ICONS } from "./links.js";

topbar("explore");

const EXAMPLES = [
  "Where did new construction concentrate in 2023–2025?",
  "How far from rail does building stop?",
  "Which ZIP codes grew fastest?",
  "How many permits became buildings?",
];

const $ = (id) => document.getElementById(id);
const form = $("ask-form"), input = $("ask-input"), err = $("ask-error");
$("ask-icon").innerHTML = ICONS.search;
$("chips").innerHTML = EXAMPLES.map((q) => `<button type="button" class="chip">${q}</button>`).join("");
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { input.value = c.textContent; input.focus(); }));
input.addEventListener("input", () => { err.textContent = ""; });

// the map (MapLibre is large) loads only when the reader asks a first question or opens the map
let app = null;
async function openApp() {
  if (!app) {
    $("ask").hidden = true;
    $("app").hidden = false;
    document.body.classList.add("mapped");
    app = import("./explore-app.js").then((m) => m.start());
  }
  return app;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) { err.textContent = "Type a question first."; return; }
  (await openApp()).ask(q);
});
$("open-map").addEventListener("click", (e) => { e.preventDefault(); history.replaceState(null, "", "#map"); openApp(); });
if (location.hash === "#map") openApp();
