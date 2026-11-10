// conversations of >= 5 turns against the local Worker; flags problems, writes all answers for reading
import fs from "node:fs";
const BASE = process.argv[3] || "http://127.0.0.1:8787/api/ask";
const convs = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const lang = (s) => (/[぀-ヿ]/.test(s) ? "ja" : /[一-鿿]/.test(s) ? "zh" : /[¿¡ñ]|\b(dónde|qué|barrio|ingresos|muéstrame|más)\b/i.test(s) ? "es" : "en");
const PLACE = /\b(191\d\d|ct ?\d|tract|point breeze|fishtown|kensington|sharswood|brewerytown|university city|ucity|city center|north philly|station|temple|strawberry|zoom|show|map|where|在哪|地图|放大|どこ|地図|muéstrame|dónde)\b|在哪|地图|放大|航拍/i;
const out = [], flags = [];
let n = 0, cost = 0, secs = [];
for (const [ci, conv] of convs.entries()) {
  const h = [];
  for (const [ti, q] of conv.entries()) {
    const t0 = Date.now();
    const res = await fetch(BASE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, history: h.slice(-20) }) });
    const raw = await res.text();
    const ev = raw.trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return { t: "bad" }; } });
    const a = ev.find((e) => e.t === "answer")?.text || "", memo = ev.find((e) => e.t === "memo")?.text, use = ev.find((e) => e.t === "usage") || {};
    const maps = ev.filter((e) => e.t === "map").map((e) => e.action), tools = ev.filter((e) => e.t === "status").map((e) => e.text);
    const s = (Date.now() - t0) / 1000; secs.push(s); cost += use.cost_usd || 0; n++;
    const f = [];
    if (!res.ok || ev.some((e) => e.t === "error" || e.error)) f.push(`error ${res.status} ${raw.slice(0, 120)}`);
    if (!a) f.push("no answer");
    if (/DSML|<｜|\[context:/.test(a)) f.push("markup");
    if (/\b\d{4}_\d{3}\b|42101\d{7}/.test(a)) f.push("id leak");
    if (a && lang(q) !== "en" && lang(a) !== lang(q)) f.push(`language ${lang(q)}->${lang(a)}`);
    if (a && lang(q) === "en" && lang(a) !== "en") f.push(`language en->${lang(a)}`);
    if (PLACE.test(q) && !maps.length) f.push("no map");
    if (f.length) flags.push(`C${ci + 1}.${ti + 1} ${f.join("; ")} | ${q}`);
    out.push(`\n### C${ci + 1}.${ti + 1} (${s.toFixed(1)} s, ${use.model || "?"}) ${q}\n[tools] ${tools.join(" | ")}\n${a}\n[map] ${maps.map((m) => JSON.stringify(m).slice(0, 220)).join(" || ")}${f.length ? `\n[FLAG] ${f.join("; ")}` : ""}`);
    h.push({ role: "user", content: q }, { role: "assistant", content: memo ? `${a}\n[context: ${memo}]` : a });
    await new Promise((r) => setTimeout(r, Math.max(0, 8000 - (Date.now() - t0))));
  }
  process.stderr.write(`conversation ${ci + 1}/${convs.length} done\n`);
}
secs.sort((x, y) => x - y);
const head = `answers ${n}, flagged ${flags.length}, median ${secs[Math.floor(n / 2)].toFixed(1)} s, max ${secs.at(-1).toFixed(1)} s, total $${cost.toFixed(4)}\n${flags.join("\n")}\n`;
fs.writeFileSync(process.argv[2].replace(".json", ".out.txt"), head + out.join("\n"));
console.log(head);
