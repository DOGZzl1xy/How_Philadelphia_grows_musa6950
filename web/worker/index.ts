// Cloudflare Worker: the static site (assets) plus /api/ask, the Explore assistant (DeepSeek, OpenAI-compatible API).
// Questions are not logged or stored. A Durable Object keeps today's spend; above the daily cap the assistant stops
// until the next UTC day. Model provider: LLM_PROVIDER = "deepseek" (default, with Gemini as automatic backup) or
// "gemini"; keys are Worker secrets (DEEPSEEK_API_KEY, GEMINI_API_KEY), set by the author.
import { DurableObject } from "cloudflare:workers";
import { tables, type Tables } from "./data";
import { systemPrompt } from "./prompt";
import { splitMarkup } from "./markup";
import { TOOL_DEFS, mapAction, mentioned, runTool } from "./tools";

interface Env {
  ASSETS: Fetcher;
  BUDGET: DurableObjectNamespace<Budget>;
  ASK_LIMIT?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  DEEPSEEK_API_KEY?: string;
  GEMINI_API_KEY?: string;
  LLM_PROVIDER?: string;               // "deepseek" (default) or "gemini"
  DEEPSEEK_BASE?: string;              // local testing only (a mock server); default https://api.deepseek.com
  DEBUG_USAGE?: string;                // local testing only: "1" adds the provider's raw usage to the usage event
}

const DAILY_CAP_USD = 2;
const MAX_ROUNDS = 5;

// Providers (both OpenAI-compatible chat completions). cost(usage, now) returns US dollars.
type Usage = { hit: number; miss: number; out: number };
interface Provider { timeoutMs: number; base: (env: Env) => string; key: (env: Env) => string | undefined; model: string; body: Record<string, unknown>;
  usage: (u: any) => Usage; cost: (u: Usage, now: Date) => number; noteRole: "system" | "user" }

// DeepSeek deepseek-flash, CNY per 1M tokens (checked 2026-11-07). Peak: Beijing time Mon-Fri 9-12 and 14-18; Chinese
// public holidays are off-peak but counted as peak here, which only over-counts. 7.0 CNY per USD, slightly low.
const DEEPSEEK: Provider = {
  timeoutMs: 25000,
  base: (env) => env.DEEPSEEK_BASE || "https://api.deepseek.com", key: (env) => env.DEEPSEEK_API_KEY, model: "deepseek-flash",
  body: { thinking: { type: "disabled" }, temperature: 0.3, max_tokens: 600 }, noteRole: "system",
  usage: (u) => { const h = u.prompt_cache_hit_tokens || 0; return { hit: h, miss: u.prompt_cache_miss_tokens ?? Math.max((u.prompt_tokens || 0) - h, 0), out: u.completion_tokens || 0 }; },
  cost: (u, now) => {
    const bj = new Date(now.getTime() + 8 * 3600e3), d = bj.getUTCDay(), h = bj.getUTCHours();
    const peak = d >= 1 && d <= 5 && ((h >= 9 && h < 12) || (h >= 14 && h < 18));
    const p = peak ? { hit: 0.04, miss: 2, out: 8 } : { hit: 0.02, miss: 1, out: 4 };
    return (u.hit * p.hit + u.miss * p.miss + u.out * p.out) / 1e6 / 7.0;
  },
};
// Gemini gemini-3.8-flash, USD per 1M tokens: input 0.75, cached 0.075, output (thinking included) 3.75 until
// 2026-12-31, then doubled. Gemini 3 keeps its default temperature (Google advises against lowering it); thinking low.
const GEMINI: Provider = {
  timeoutMs: 45000,
  base: () => "https://generativelanguage.googleapis.com/v1beta/openai", key: (env) => env.GEMINI_API_KEY, model: "gemini-3.8-flash",
  body: { reasoning_effort: "low", max_tokens: 2000 }, noteRole: "user",
  usage: (u) => { const h = u.prompt_tokens_details?.cached_tokens || 0, all = u.prompt_tokens || 0;
    return { hit: h, miss: Math.max(all - h, 0), out: Math.max((u.total_tokens || 0) - all, u.completion_tokens || 0) }; },
  cost: (u, now) => { const k = now >= new Date("2027-01-01T00:00:00Z") ? 2 : 1; return k * (u.hit * 0.075 + u.miss * 0.75 + u.out * 3.75) / 1e6; },
};
const provider = (env: Env) => (env.LLM_PROVIDER === "gemini" ? GEMINI : DEEPSEEK);

export class Budget extends DurableObject {
  async spent(day: string): Promise<number> {
    return (await this.ctx.storage.get<number>(day)) || 0;
  }
  async add(day: string, usd: number): Promise<number> {
    const v = ((await this.ctx.storage.get<number>(day)) || 0) + usd;
    await this.ctx.storage.put(day, v);
    // keep one week
    const keys = [...(await this.ctx.storage.list<number>()).keys()].sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 7))) await this.ctx.storage.delete(k);
    return v;
  }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function hasData(text: string): boolean {
  const nums = text.replace(/\b250 ?m\b|1,000|\b191\d\d\b|\b(19|20)\d\d\b/g, "").match(/\d+(?:[.,]\d+)?/g) || [];
  return nums.length > 0;
}

// remove anything that looks like a cell id (1234_567) or a block-group id (12 digits), in case the model slips
const scrub = (s: string) => s.replace(/\s*\[context:[^\]]*\]?\s*$/gim, "").replace(/\b\d{4}_\d{3}\b/g, "").replace(/\b42101\d{7}\b/g, "").replace(/[ \t]{2,}/g, " ");

const STATUS: Record<string, (a: any) => string> = {
  lookup_area: (a) => `Looking up ${a.name}…`,
  area_stats: (a) => (a.level === "city" ? "Reading city-wide results…" : `Reading the numbers for ${a.level === "zip" ? `ZIP ${a.id}` : a.level === "neighbourhood" ? a.id : a.level === "tract" ? `census tract ${String(a.id).replace(/^\D+/, "")}` : "this area"}…`),
  rank_areas: (a) => `Ranking ${({ zip: "ZIP codes", neighbourhood: "neighbourhoods", tract: "census tracts", cell: "250 m blocks", block_group: "block groups" } as any)[a.level] || "areas"}…`,
  citywide: () => "Reading city-wide results…",
  find_station: (a) => (a.name ? `Looking up the station ${a.name}…` : `Listing the stations in ${a.neighbourhood || `ZIP ${a.zip}`}…`),
  rank_stations: () => "Ranking station areas…",
  compare_groups: () => "Comparing groups…",
  update_map: () => "Updating the map…",
};

// The answer's language, decided from the question itself so earlier turns cannot carry another language over.
// Scripts first, then common words and letters of the Latin-script languages readers are likely to use.
function language(q: string): string {
  if (/[\u3040-\u30ff]/.test(q)) return "Japanese";
  if (/[\u4e00-\u9fff]/.test(q)) return "Chinese";
  if (/[\uac00-\ud7af]/.test(q)) return "Korean";
  const w = ` ${q.toLowerCase().replace(/[^a-zà-ÿ¿¡]+/g, " ")} `;
  const score = (re: RegExp) => (w.match(re) || []).length;
  const s: Record<string, number> = {
    Spanish: score(/[¿¡ñ]| (dónde|donde|qué|que|cuál|cuántos|cuántas|cómo|el|la|los|las|del|barrio|barrios|más|ingresos|inquilinos|muéstrame|y|en|se|hay|por)(?= )/g),
    French: score(/ (où|quel|quelle|quels|combien|le|la|les|des|du|est|quartier|plus|revenus|montre|moi|et|à)(?= )|[çœ]/g),
    German: score(/ (wo|wie|welche|welcher|viele|der|die|das|und|ist|nicht|zeig|mir|stadtteil|mehr|einkommen|wurde|wird|am|meisten|gebaut|gibt|es)(?= )|[äöüß]/g),
    Portuguese: score(/ (onde|qual|quais|quantos|como|bairro|mais|renda|mostre|não|é|e|do|da|os|as)(?= )|[ãõ]/g),
  };
  const en = score(/ (the|what|where|which|how|is|are|and|of|in|show|me|did|does|why|about)(?= )/g);
  const [best, n] = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
  return n >= 2 && n > en ? best : n >= 1 && en === 0 && /[à-ÿ¿¡]/.test(q) ? best : "English";
}

// One question with one provider; throws if the provider fails (acc keeps what was spent, for the daily cap).
async function answerWith(env: Env, P: Provider, t: Tables, question: string, history: any[], emit: (e: any) => Promise<void>,
  acc: { usd: number }) {
  const langNote = `(Answer in ${language(question)}.)`;
  const messages: any[] = [{ role: "system", content: systemPrompt(t) }, ...history, { role: "user", content: `${question}\n\n${langNote}` }];
  const now = new Date();
  let hit = 0, miss = 0, out = 0;
  const raw: any[] = [];
  const parts: string[] = [];          // text the model writes in every round (also next to tool calls)
  const memo = new Set<string>();       // areas and layers of this turn, sent back with the answer as follow-up context
  let looked = 0, nudged = false, mapped = false;
  // stations: the answer used the station tools; figures: it also read growth or census numbers. An answer about the
  // stations themselves shows the rail stops and no data layer (the previous answer's layer would say nothing about it).
  let stations = false, figures = false, railShown = false, layerSet = false;
  const DATA_TOOLS = new Set(["area_stats", "rank_areas", "rank_stations", "citywide", "compare_groups"]);
  const forStations = (a: any) => {
    const out = { ...a };
    if (stations && typeof out.show_rail !== "boolean") out.show_rail = true;
    if (stations && !figures && (!out.layer || out.layer === "keep")) out.layer = "off";
    if (out.show_rail === true) railShown = true;
    if (out.layer && out.layer !== "keep") layerSet = true;
    return out;
  };
  const areas: { level: string; id: string }[] = [];   // areas read in this turn, for the fallback map action
  const run = async (calls: any[]) => {
    messages.push({ role: "assistant", content: "", tool_calls: calls });
    for (const call of calls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* keep {} */ }
      const name = call.function.name;
      if (name !== "update_map") looked++;
      if (name === "update_map") mapped = true;
      if (name === "find_station" || name === "rank_stations") stations = true;
      if (DATA_TOOLS.has(name)) figures = true;
      if (name === "area_stats" && (args.level === "zip" || args.level === "neighbourhood" || args.level === "tract") && typeof args.id === "string"
        && !areas.some((a) => a.level === args.level && a.id === args.id)) areas.push({ level: args.level, id: args.id });
      for (const k of ["name", "id"]) if (typeof args[k] === "string" && args[k] !== "city") memo.add(`${args.level || "area"} ${args[k]}`);
      if (args.within?.id) memo.add(`${args.within.level} ${args.within.id}`);
      if (name === "rank_areas") memo.add(`ranked ${args.level} by ${args.metric}${args.period ? ` ${args.period}` : args.year ? ` ${args.year}` : ""}`);
      if (name === "update_map" && args.layer && args.layer !== "keep") memo.add(`map layer ${args.layer}`);
      if (name === "update_map" && Array.isArray(args.play_years) && args.play_years.length > 1) memo.add(`map playing years ${args.play_years.join(", ")}`);
      await emit({ t: "status", text: (STATUS[name] || (() => "Working…"))(args) });
      if (name === "update_map") await emit({ t: "map", action: mapAction(t, forStations(args)) });
      let result: any;
      try { result = runTool(t, name, args); } catch { result = { error: "tool failed" }; }
      if (name === "lookup_area" && ["zip", "neighbourhood", "tract"].includes(result?.level) && !areas.some((a) => a.id === result.id))
        areas.push({ level: result.level, id: result.id });
      if (name === "rank_stations") for (const st of (result.results || []).slice(0, 3)) {
        if (st.neighbourhood && !areas.some((a) => a.id === st.neighbourhood)) areas.push({ level: "neighbourhood", id: st.neighbourhood });
      }
      if (name === "find_station" && result.area && !areas.some((a) => a.id === result.area.id)) areas.push(result.area);
      if (name === "find_station") for (const st of result.stations || []) {
        if (st.neighbourhood && !areas.some((a) => a.id === st.neighbourhood)) areas.push({ level: "neighbourhood", id: st.neighbourhood });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
    }
  };
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const last = round === MAX_ROUNDS;
    // last round: no tools at all (with tool_choice "none" the model wrote its tool call out as text)
    if (last) messages.push({ role: P.noteRole, content: "Tool budget used. Answer the reader now in plain text from the tool results above; say briefly if something could not be looked up." });
    const res = await fetch(`${P.base(env)}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${P.key(env)}` },
      body: JSON.stringify({ model: P.model, messages, ...(last ? {} : { tools: TOOL_DEFS, tool_choice: "auto" }), ...P.body, stream: false }),
      signal: AbortSignal.timeout(P.timeoutMs),
    });
    if (!res.ok) throw new Error(`${P.model} ${res.status}`);
    const data: any = await res.json();
    if (env.DEBUG_USAGE === "1") raw.push(data.usage);
    const u = P.usage(data.usage || {});
    hit += u.hit; miss += u.miss; out += u.out;
    acc.usd += P.cost(u, now);
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("empty reply");
    const { text, calls } = splitMarkup(msg.content || "");
    if (text.trim()) parts.push(text.trim());
    const toolCalls = msg.tool_calls?.length ? msg.tool_calls : calls;
    if (toolCalls.length && !last) { await run(toolCalls); continue; }
    // an answer with data numbers but no lookup in this turn is copied or invented (seen on follow-ups): ask once more
    if (!looked && !nudged && !last && hasData(text)) {
      nudged = true;
      parts.pop();
      messages.push({ role: "assistant", content: text },
        { role: P.noteRole, content: "You answered without calling any tool in this turn. Earlier answers are context only. Look up this question's numbers with the tools now, update the map if it concerns a place, then answer." });
      continue;
    }
    break;
  }
  // tool-call rounds often carry narration ("I'll look that up") or a first draft; keep only the final text, unless it
  // is a short tail that refers back to a longer earlier part
  const final = parts.at(-1) || "";
  const earlier = parts.slice(0, -1).filter((x) => x.length > 150).at(-1);
  const answer = final.length < 150 && earlier ? `${earlier}\n\n${final}` : final;
  await emit({ t: "answer", text: scrub(answer).trim() || "Sorry, I could not find an answer to that." });
  // the model sometimes reads an area, or answers about a named one, without moving the map: show those areas
  if (!mapped && !areas.length) areas.push(...mentioned(t, question));
  if (!mapped && areas.length) {
    const lv = areas[0].level, same = areas.filter((a) => a.level === lv).slice(0, 8);
    await emit({ t: "map", action: mapAction(t, forStations({ focus: same, highlight: { level: lv, ids: same.map((a) => a.id) },
      ...(lv === "zip" ? { show_zips: true } : lv === "tract" ? { show_tracts: true } : { show_neighbourhoods: true }) })) });
  }
  // the map was moved before the station lookup, or not at all: still bring in the stops (and drop a stale layer)
  if (stations && (!railShown || (!figures && !layerSet))) await emit({ t: "map", action: mapAction(t, forStations({})) });
  if (memo.size) await emit({ t: "memo", text: [...memo].slice(0, 12).join("; ") });
  await emit({ t: "usage", tokens: hit + miss + out, prompt_cache_hit: hit, prompt_cache_miss: miss, completion: out, cost_usd: acc.usd,
    model: P.model, ...(raw.length ? { raw } : {}) });
}

// DeepSeek answers; if it fails or times out, Gemini answers the same question from the start (Gemini 3 needs its own
// signatures on earlier tool calls of a turn, so DeepSeek's partial rounds are not carried over).
async function ask(env: Env, t: Tables, question: string, history: any[], emit: (e: any) => Promise<void>, day: string) {
  const acc = { usd: 0 };
  const primary = provider(env), backup = primary === DEEPSEEK && env.GEMINI_API_KEY ? GEMINI : null;
  try {
    await answerWith(env, primary, t, question, history, emit, acc);
  } catch (e) {
    if (!backup) throw e;
    await emit({ t: "status", text: "Switching to the backup model…" });
    await answerWith(env, backup, t, question, history, emit, acc);
  } finally {
    await env.BUDGET.get(env.BUDGET.idFromName("global")).add(day, acc.usd);
  }
}

// up to the last 10 turns; answers older than the last two are shortened (their context note is kept), which keeps
// a long conversation at a few thousand tokens
function cleanHistory(h: unknown): any[] {
  if (!Array.isArray(h)) return [];
  const ok = h.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-20);
  return ok.map((m, i) => {
    const recent = i >= ok.length - 4;
    if (m.role === "user") return { role: "user", content: m.content.slice(0, 300) };
    const [body, note] = m.content.split("\n[context: ");
    const short = recent ? body.slice(0, 2000) : body.length > 300 ? `${body.slice(0, 300)}…` : body;
    return { role: "assistant", content: note ? `${short}\n[context: ${note.slice(0, 400)}` : short };
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (url.pathname !== "/api/ask") return json({ error: "Not found." }, 404);
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    if (!provider(env).key(env)) return json({ error: "The assistant is not configured yet." }, 503);
    if (env.ASK_LIMIT) {
      const ip = req.headers.get("cf-connecting-ip") || "local";
      if (!(await env.ASK_LIMIT.limit({ key: ip })).success) return json({ error: "Too many questions in a short time. Please wait a minute." }, 429);
    }
    let body: any;
    try { body = JSON.parse((await req.text()).slice(0, 20000)); } catch { return json({ error: "Bad request." }, 400); }
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : "";
    if (!question) return json({ error: "Type a question first." }, 400);
    const day = new Date().toISOString().slice(0, 10);
    const budget = env.BUDGET.get(env.BUDGET.idFromName("global"));
    if ((await budget.spent(day)) >= DAILY_CAP_USD) {
      return json({ error: "The assistant has used today's budget. Please try again tomorrow; the map still works." }, 429);
    }
    const t = await tables(env.ASSETS, url.origin);
    const { readable, writable } = new TransformStream();
    const w = writable.getWriter(), enc = new TextEncoder();
    const emit = (e: any) => w.write(enc.encode(JSON.stringify(e) + "\n"));
    ctx.waitUntil((async () => {
      try {
        await ask(env, t, question, cleanHistory(body.history), emit, day);
      } catch {
        await emit({ t: "error", text: "The assistant is unavailable right now. Please try again in a moment." });
      } finally {
        await w.close();
      }
    })());
    return new Response(readable, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  },
};
