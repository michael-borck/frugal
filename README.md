# frugal

One command to a working, auto-failover AI setup. frugal is a thin, opinionated installer/configurator for a local **9Router**: it starts 9Router, guides the free-provider connections (keys stay in 9Router), verifies which models actually answer, prints the `free-best` order, and wires the student's harness.

Harness support: **Pi is the recommended default** — lightweight, which matters on older student laptops — and frugal adds a `9router` provider to Pi's `~/.pi/agent/models.json` without touching the student's existing Ollama or shared-server providers. **OpenCode** is supported when the machine can handle it (provider + compaction). **Msty.ai** is a guided paste.

frugal never sits in the request path. Once configured, the student's tools talk only to 9Router; 9Router owns provider connections and API keys, failover, quota, usage charts and the token saver, and the harness owns compaction. frugal's job is to make that setup one command, verify which models actually answer, and wire the harness.

**Scope:** frugal is deliberately thin — an opinionated installer/configurator for 9Router, not a router. Provider keys and connections live in 9Router. Power users can configure 9Router directly and ignore frugal; frugal must never get in the way. **frugal-bench is retired**; the order comes from the instructor's `picks.json` plus `frugal verify` and the reliability ledger.

> Status: early build. Working now: `setup` (start 9Router, provider guide, verify, Pi/OpenCode/Msty wiring), `verify` (probe advertised models, keep responders), the reliability ledger and `reliability`, `providers` (reads 9Router's connected models), `add`/`remove` guidance, `rankings` (picks/usage/results/catalog URLs), `doctor`/`status`, start/stop. Remaining spike items: 9Router's combo/provider API (dashboard-session only) and non-interactive provisioning. `frugal watch` and `frugal mcp` are v0.2; a Tauri desktop app is v0.3. See `docs/SPEC.md`, `docs/FALLBACK-AND-CONTEXT.md`, `docs/SPIKE.md`, and `docs/AUDIT.md`.

## Requirements

- Node.js 22 or newer
- A local 9Router instance
- Free accounts with the providers you enable (at minimum OpenRouter and Groq)

## Install

```sh
npm install -g frugalrouter
frugal setup
```

## Commands

| Command | What it does |
| --- | --- |
| `frugal` | Prints status and the everyday commands |
| `frugal setup` | First-time wizard; safe to re-run |
| `frugal status` | Router status, connected models and next step |
| `frugal doctor` | Checks every link in the chain; `--fix` applies safe fixes |
| `frugal start` / `stop` | Start or stop the router service |
| `frugal refresh` | Explain how to refresh: run `frugal verify`, then update `free-best` in 9Router |
| `frugal verify` | Probe the models 9Router advertises and keep only the ones that answer |
| `frugal models` | List the combo in order |
| `frugal prefer` / `ban` / `lock` / `reset` | Student overrides |
| `frugal tier free\|budget` | Switch tier |
| `frugal local mode fallback\|first\|only` | Set local model behaviour |
| `frugal providers` | List the providers 9Router has connected (from its model list) |
| `frugal add <provider>` / `frugal remove <provider>` | Point to 9Router's provider screen; keys and connections live in 9Router |
| `frugal rankings` | Configure optional hosted `picks.json`, `results.json`, `usage.json`, `catalog.json` URLs |
| `frugal reliability` | Show observed success and latency per provider/model over time |
| `frugal report` / `update` / `uninstall` | Upkeep |

Every command accepts `--json` where it prints data, so pilot results can be collected by script.

## Configuration

- `user.json` — local intent: pins, bans, lock, local mode, and optional hosted ranking URLs.
- `state.json` — last-known combo/refresh state, when present. (Cooldowns and quota belong to 9Router.)
- `observations.jsonl` — a local reliability ledger: timestamped pass/fail and latency per provider/model (no prompts, no keys). Kept for 90 days, pruned at most once a day. Summarised by `frugal reliability`.
- All live under the OS app-support directory (`FRUGAL_HOME` overrides it for testing) and carry a `schema_version`. Provider keys are not here; they live in 9Router, and the harness configs hold 9Router's own key.

## Ranking sources

Candidate models are the ones **9Router has connected** (`/v1/models`), checked by `frugal verify`. The order is: instructor `picks.json` (if configured), then observed reliability and latency from the ledger. Optional `results.json`, `usage.json` and `catalog.json` can be set with `frugal rankings`, but there are **no built-in defaults** (frugal-bench is retired).

```sh
frugal rankings --picks https://class.example/picks.json
```

When a source is unset or unreachable, frugal falls back to verified responders ordered by reliability and latency. The usage source is deliberately pluggable: OpenRouter's public models API exposes no usage field.

## Verifying models

9Router's `/v1/models` is a cached hint, not truth: it advertises ids that 404, models that are not chat-capable, and `:free` names that are neither free nor working. `frugal verify` probes a spread of the advertised models with a one-token request and reports which actually answer, records the results in the reliability ledger, and prints a paste-ready `free-best` order.

```sh
export FRUGAL_ROUTER_KEY="$(cat ~/9router.txt)"   # 9Router's own API key, not a provider key
frugal verify --provider cf --limit 5
frugal verify --limit 12 --out verified.json
```

Probing spends a small amount of quota (one token per model), so the default is a limited spread, not the whole list. Writing the combo is still dashboard-manual: 9Router's `/api` needs a dashboard session, not the API key (recorded in `docs/SPIKE.md`).

## Development

```sh
npm install
npm run dev -- status      # run from source with tsx
npm test                   # unit tests
npm run typecheck
npm run build              # emit dist/
```

See `docs/SPIKE.md` for the checklist that verifies 9Router's control API and fallback behaviour against a live instance.

## License

MIT. See `LICENSE`.