# Assistant tests

Run against a local Worker (`npx wrangler dev --port 8787` in `web/`, keys in `web/.dev.vars`); each question costs a
little real money.

- `node conversations.mjs conversations.json` — 25 conversations of 5 turns (tracts, ZIP codes, neighbourhoods,
  stations, permits, the model, years, census, out-of-scope and privacy probes, prompt injection, several languages,
  map commands). Flags errors, markup or id leaks, answer language and missing map moves; writes every answer to
  `conversations.out.txt` (git-ignored) for reading.
- `node checks.mjs <label> > out.json` — 31 single questions and conversations with automatic checks on key numbers,
  map actions, language and refusals; used to compare model providers (`--var LLM_PROVIDER:gemini`).

The language flag in `conversations.mjs` is a rough heuristic; read flagged answers before acting on them.
