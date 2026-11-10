# Presentation website

Scroll-step storytelling site for the final project, hosted on Cloudflare under xuanyuzhou.org (deploy only with the
author's approval).

## Layout

| Path | What | In git |
|---|---|---|
| `index.html`, `src/` | site code: `steps.js` is the story (one entry per screen), `main.js` the stage and navigation, `zoom.js` the opening flight, `model.js` / `diagrams.js` act 3, `results.js` acts 4-5, `style.css` the visual system | yes |
| `explore.html`, `src/explore*.js`, `src/layers.js` | Explore: search page, then a MapLibre map with a left panel (layers off by default) and the assistant's answers | yes |
| `worker/` | Cloudflare Worker: serves the site and `/api/ask`, the Explore assistant (DeepSeek `deepseek-flash`, tools over aggregated tables only, daily cost cap in a Durable Object, rate limit per IP, questions not logged) | yes |
| `pipeline/` | Python scripts that export assets from the local project data | yes |
| `404.html`, `src/notfound.js` | page for unknown addresses (`not_found_handling` in `wrangler.jsonc`) | yes |
| `public/favicon.*`, `public/apple-touch-icon.png`, `public/og.jpg` | site icon and share card (`og.jpg`: the cover at 1200 x 630 without the controls, a screenshot of the local preview) | yes |
| `public/data/` | generated assets (graded photos, LiDAR height, outlines); rebuilt by `pipeline/` | **no** (data stays local) |
| `node_modules/`, `dist/`, `.wrangler/` | tooling output | no |

## Commands

```bash
uv run python web/pipeline/export_scenes.py      # from the repository root: the three scenes (photos, LiDAR height, outlines)
uv run python web/pipeline/export_hero.py        # opening shot layers (run after export_scenes)
uv run python web/pipeline/export_model_assets.py   # training curve, backbone comparison, ZIP roles
POPUP_DATA=citywide uv run python web/pipeline/export_results.py   # test cells, city cells, yearly series, rail, permits
uv run python web/pipeline/export_explore.py     # Explore: cells, block groups, ZIP codes, neighbourhoods, tables.json
uv run python web/pipeline/pull_live_data.py     # or: fetch public/data/ back from the live site
npm --prefix web run dev                         # local preview at http://localhost:5173 (/api is proxied to :8787)
npm --prefix web run build && (cd web && npx wrangler dev)   # the Worker + assistant on :8787; key in web/.dev.vars
npm --prefix web run build                       # static build into web/dist
```

## Rules for assets

- Scenes: the three 250 m cells with the most LiDAR-measured new construction 2018-2025 (different ZIPs, outside
  high-rise cells), fixed in `pipeline/export_scenes.py` before looking at any image.
- No street names, addresses, parcel ids or coordinates in any exported file; outlines are in local pixel space.
- Pop-ups are not exported or shown per building.
- Aerial photography is credited to the City of Philadelphia on every screen.

## Type and sizes

- Archivo and Inter are served from the site itself (variable fonts from the `@fontsource-variable` packages, declared in
  `src/tokens.css`, preloaded in each page's head); there is no request to a font service.
- On the story, sizes are written as `calc(n * var(--u))`: `--u` is 1px up to a 1440 x 900 window and grows with larger
  windows (to 1.5px), so text keeps its size relative to the frame on a projector.

## Navigation

One wheel gesture, arrow key, Page Up/Down, space or swipe moves exactly one step; the dots on the right jump to a
step; `#n` in the URL opens step n.

## Explore assistant

- Model: DeepSeek `deepseek-flash`; if a call fails or takes more than 25 s, Gemini `gemini-3.8-flash` answers the question
  from the start (`LLM_PROVIDER=gemini` makes Gemini the only model).
- Keys: `DEEPSEEK_API_KEY` and `GEMINI_API_KEY` are Worker secrets (`npx wrangler secret put <NAME>` in `web/`), and for
  local runs lines in `web/.dev.vars` (git-ignored). The author sets them; keys are never in git.
- Tools (`worker/tools.ts`): look up an area, numbers for an area, rank areas, city-wide results, compare groups, update
  the map. They read `public/data/explore/tables.json` (no geometry, no coordinates); the map action names areas and the
  page looks them up in its own outlines.
- Rules (`worker/prompt.ts`): the key numbers are filled in from the same tables; answers in the reader's language; no
  single buildings, addresses, street names, coordinates or ids; added storeys only for the LiDAR periods; model years
  are estimates of new buildings only.
- Cost: DeepSeek prices in CNY with Beijing peak hours, converted at 7.0 CNY per USD; Gemini in USD (doubles on 2027-01-01); each answer shows its tokens and
  cost; the assistant stops for the day at $2 (`DAILY_CAP_USD`). At most 8 questions a minute per IP.
- Testing without a key: `npx wrangler dev --var DEEPSEEK_API_KEY:x --var DEEPSEEK_BASE:http://127.0.0.1:8790` against a
  local mock of the chat completions endpoint.
