// Explore after the first question: map + panel + the conversation with the assistant (/api/ask, same Worker).
// The assistant's map actions come back as events and are applied here; it never sends coordinates, only layer ids
// and area names or ids, which this page looks up in its own outlines.
import { focus, getMap, highlight, initMap, known, setState, whole } from "./explore-map.js";
import { card, renderLayers, setCollapsed } from "./explore-panel.js";
import { ACS, GROWTH, PERIODS, PHOTO_YEARS, YEARS } from "./layers.js";

const $ = (id) => document.getElementById(id);
const thread = $("thread"), layersEl = $("layers"), cardEl = $("card"), cardBody = $("card-body");
const history = [];        // [{role, content}] of earlier turns (answer + context note), sent back for follow-up questions
let busy = false;
const byAssistant = new Set();   // outlines and rail stops switched on by an answer (not by hand)
let stale = new Set();           // those of earlier answers, dropped by the first map action of a new answer

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// small Markdown subset: paragraphs, "- " lists, **bold**
function md(text) {
  return text.trim().split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-•*]\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(inline).join("<br>")}</p>`;
  }).join("");
}

function showCard(level, id) {
  const html = card(level, id);
  if (!html) return;
  cardBody.innerHTML = html;
  cardEl.hidden = false;
}
cardEl.querySelector(".card-x").addEventListener("click", () => { cardEl.hidden = true; highlight(null, []); });

function onMap(e) {
  if (e.type === "state") renderLayers(layersEl);
  if (e.type === "select") showCard(e.level, e.id);
}

// ---------- assistant map actions ----------
function validLayer(l) {
  if (!l || typeof l !== "object") return null;
  if (l.type === "growth" && GROWTH[l.kind]) return { type: "growth", kind: l.kind, period: PERIODS[l.period] ? l.period : "2022_2025" };
  if (l.type === "model" && YEARS[l.year]) return { type: "model", year: String(l.year) };
  if (l.type === "acs" && ACS[l.field]) return { type: "acs", field: l.field, year: l.year === "2019" ? "2019" : "2023" };
  return null;
}

function apply(a) {
  const next = {};
  if (a.layer === "off") next.fill = null;
  else if (a.layer) { const l = validLayer(a.layer); if (l) next.fill = l; }
  for (const k of ["zips", "hoods", "tracts", "rail", "street"]) {
    if (typeof a[k] === "boolean") { next[k] = a[k]; stale.delete(k); if (a[k]) byAssistant.add(k); else byAssistant.delete(k); }
    else if (stale.has(k)) { next[k] = false; stale.delete(k); byAssistant.delete(k); }
  }
  if (a.photo === false) next.photo = null;
  else if (PHOTO_YEARS.includes(+a.photo)) next.photo = +a.photo;
  setState(next);
  const areas = Array.isArray(a.focus) ? a.focus.filter((x) => x && known(x.level, x.id)) : [];
  if (a.focus === "city" || (Array.isArray(a.focus) && a.focus.length && !areas.length)) whole();
  else if (areas.length) focus(areas);
  if (a.highlight && Array.isArray(a.highlight.ids)) highlight(a.highlight.level, a.highlight.ids.filter((id) => known(a.highlight.level, id)));
  else if (a.focus) highlight(null, []);                 // a new place without its own outline: drop the old one
  if (a.card && known(a.card.level, a.card.id)) showCard(a.card.level, a.card.id);
}

// ---------- conversation ----------
function turn(q) {
  const el = document.createElement("article");
  el.className = "turn";
  el.innerHTML = `<button type="button" class="q" aria-expanded="true">${esc(q)}</button><div class="a"><p class="status">Thinking…</p></div><p class="meta"></p>`;
  // earlier turns fold to their question; a click opens one again (the conversation continues from all of them)
  el.querySelector(".q").addEventListener("click", () => {
    if (!el.classList.contains("old")) return;
    el.classList.toggle("open");
    el.querySelector(".q").setAttribute("aria-expanded", el.classList.contains("open"));
  });
  thread.querySelector(".intro")?.remove();
  thread.querySelectorAll(".turn").forEach((t) => { t.classList.add("old"); t.classList.remove("open"); t.querySelector(".q").setAttribute("aria-expanded", "false"); });
  thread.append(el);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  return el;
}

async function ask(q) {
  if (busy || !q) return;
  busy = true;
  stale = new Set(byAssistant);
  const el = turn(q), a = el.querySelector(".a"), meta = el.querySelector(".meta");
  let answer = "", memo = "";
  try {
    const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q, history: history.slice(-20) }) });
    if (!res.ok || !res.body) {
      const msg = res.status === 404 ? "The assistant is not connected yet." : (await res.json().catch(() => ({}))).error || `Error ${res.status}.`;
      throw new Error(msg);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.t === "status") a.querySelector(".status") && (a.querySelector(".status").textContent = ev.text);
        if (ev.t === "map") apply(ev.action);
        if (ev.t === "answer") { answer = ev.text; a.innerHTML = md(answer); setCollapsed(true, layersEl); }
        if (ev.t === "memo") memo = ev.text;
        if (ev.t === "usage") meta.textContent = `${ev.tokens.toLocaleString("en-US")} tokens, $${ev.cost_usd.toFixed(4)}`;
        if (ev.t === "error") throw new Error(ev.text);
      }
    }
    if (!answer) throw new Error("No answer came back. Please try again.");
    history.push({ role: "user", content: q }, { role: "assistant", content: memo ? `${answer}\n[context: ${memo}]` : answer });
  } catch (e) {
    a.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  } finally {
    busy = false;
  }
}

export async function start() {
  thread.innerHTML = `<p class="intro">Ask where and when Philadelphia grew. The map follows each answer; every layer below can
    also be switched on by hand.</p>`;
  await initMap($("map"), onMap);
  renderLayers(layersEl);
  if (import.meta.env.DEV) window.__explore = { apply, ask, map: () => getMap() };     // local testing of the assistant's map actions
  const f = $("ask-form-2"), i = $("ask-input-2");
  f.addEventListener("submit", (e) => { e.preventDefault(); const q = i.value.trim(); i.value = ""; ask(q); });
  return { ask, fit: whole };
}
