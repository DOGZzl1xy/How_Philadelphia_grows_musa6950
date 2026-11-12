import "./pages.css";
import "./explore.css";
import { topbar } from "./nav.js";
import { ICONS } from "./links.js";

topbar("explore");

const EXAMPLES = [
  "Where did new buildings concentrate after 2022?",
  "In which year did the city build the most?",
  "Where were added floors found from the street?",
  "Do permits match what was built?",
];

const $ = (id) => document.getElementById(id);
const form = $("ask-form"), input = $("ask-input"), err = $("ask-error");
$("ask-icon").innerHTML = ICONS.search;
$("chips").innerHTML = EXAMPLES.map((q) => `<button type="button" class="chip">${q}</button>`).join("");
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => { input.value = c.textContent; input.focus(); }));
input.addEventListener("input", () => { err.textContent = ""; });

// the map loads behind the search page, which is a veil over it: asking a question lifts the veil
const app = import("./explore-app.js").then((m) => m.start());
function openApp() {
  const ask = $("ask");
  if (!ask.classList.contains("gone")) {
    ask.classList.add("gone");
    document.body.classList.add("opened");
    setTimeout(() => { ask.hidden = true; }, 700);
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
