# frugal

One command to a working, auto-failover AI setup. frugal is a thin, opinionated installer/configurator for a local **9Router**: it starts 9Router, walks the student through adding free providers (keys go straight to 9Router), verifies which models actually answer, applies the `free-best` combo, and wires the harness.

Harness support: **Pi is the recommended default** — lightweight, which matters on older student laptops — and frugal adds a `9router` provider to Pi's `~/.pi/agent/models.json` without touching the student's existing Ollama or shared-server providers. **OpenCode** is supported when the machine can handle it (provider + compaction). **Msty.ai** is a guided paste.

frugal never sits in the request path. Once configured, the student's tools talk only to 9Router; 9Router owns provider connections and API keys, failover, quota, usage charts and the token saver, and the harness owns compaction. frugal's job is to make that setup one command, verify which models actually answer, and wire the harness.

**Scope:** frugal is deliberately thin — an opinionated installer/configurator for 9Router, not a router. Provider keys and connections live in 9Router. Power users can configure 9Router directly and ignore frugal; frugal must never get in the way. **frugal-bench is retired**; the order comes from the instructor's `picks.json` plus `frugal verify` and the reliability ledger.

> Status: early build. Working now: `setup` (start 9Router, dashboard login, guided provider add via 9Router, catalog refresh, verify, apply `free-best` with Fallback, Pi/OpenCode/Msty wiring), `verify`, the reliability ledger and `reliability`, `providers` (reads 9Router's connected models), `add`/`remove` guidance, `rankings`, `doctor`/`status`, start/stop. Remaining spike items: OAuth provider connections (browser) and non-interactive dashboard-password provisioning. `frugal watch` and `frugal mcp` are v0.2; a Tauri desktop app is v0.3. See `docs/SPEC.md`, `docs/FALLBACK-AND-CONTEXT.md`, `docs/SPIKE.md`, and `docs/AUDIT.md`.

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

9Router's `/v1/models` is a cached hint, not truth: it advertises ids that 404, models that are not chat-capable, and `:free` names that are neither free nor working. `frugal setup` logs in to 9Router's dashboard with the password you supply, **refreshes provider catalogs** (`/api/models/catalog-sync`), reuses or creates an API key, probes a spread of models, and writes `free-best` with **Strategy: Fallback** through the session API. When you skip the login, it prints a paste-ready order instead.

```sh
export FRUGAL_ROUTER_PASSWORD="<dashboard password>"   # session mode (not stored)
export FRUGAL_ROUTER_KEY="$(cat ~/9router.txt)"        # fallback: API key only
frugal setup
frugal verify --provider cf --limit 5
```

Probing spends a small amount of quota (one token per model), so the default is a limited spread. The dashboard password is held in memory for setup only; the created/reused `sk-` key is what the harness configs use.

## Adding providers

`frugal setup` can add free providers for you through 9Router's API: OpenCode Free (no key), OpenRouter, Groq, Cloudflare (API token + Account ID), Kilo, NVIDIA, Mistral and Gemini. It asks for the key, validates it (`/api/providers/validate`), creates the connection (`/api/providers`) and stores nothing locally; the key lives in 9Router. OAuth providers (Kiro, Gemini CLI, Copilot) still use 9Router's browser flow.

Paid plans are out of scope: connect OpenCode Go, Z.ai or ClinePass in 9Router's dashboard and create your own `budget-best` combo. frugal stays free-only.

## Development

```sh
npm install
npm run dev -- status      # run from source with tsx
npm test                   # unit tests
npm run typecheck
npm run build              # emit dist/
```

See `docs/SPIKE.md` for the checklist that verifies 9Router's control API and fallback behaviour against a live instance.

## Testing from a clean slate

9Router keeps its data in `~/.9router` on macOS/Linux (`%APPDATA%\9router` on Windows), with the SQLite database at `~/.9router/db/data.sqlite`. Uninstalling the npm package does **not** remove that data, and a running instance keeps port 20128 busy.

The easy path is the bundled script:

```sh
npm run clean-test -- --dry-run        # print the plan
npm run clean-test                     # stop the port (asks), run setup, clean up
npm run clean-test -- --isolated-home  # also keep Pi/OpenCode configs in the temp HOME
npm run clean-test -- --keep           # keep the temp dir afterwards
```

It runs frugal with an isolated `FRUGAL_HOME` and a fresh 9Router `DATA_DIR`, sets `test1234` as the fresh instance's dashboard password, and stops/removes everything on exit. It never touches `~/.9router`.

Manual equivalent:

1. Stop any running 9Router:
   ```sh
   lsof -nP -iTCP:20128 -sTCP:LISTEN    # kill that PID, or quit the 9Router tray/CLI
   ```
2. Run frugal against an isolated data directory:
   ```sh
   export FRUGAL_HOME=/tmp/frugal-clean
   export FRUGAL_ROUTER_DATA_DIR=/tmp/frugal-clean/nine-data
   export FRUGAL_ROUTER_INITIAL_PASSWORD=test1234
   export FRUGAL_ROUTER_PASSWORD=test1234
   frugal setup
   ```
   frugal installs its own pinned 9Router under `$FRUGAL_HOME/router`, so a global `npm install -g 9router` is optional. Stop it with `FRUGAL_HOME=/tmp/frugal-clean frugal stop`; remove the test with `rm -rf /tmp/frugal-clean`.
3. To wipe the real 9Router instead, stop it and move the data aside: `mv ~/.9router ~/.9router.bak`.

The harness configs are the real ones: frugal backs up and updates `~/.pi/agent/models.json` (preserving your Ollama and shared-server providers) or `~/.config/opencode/opencode.json`. Move those aside first, or use `--isolated-home`, if you want a totally clean harness test.

Note: `frugal setup` is interactive (provider menu, verify, harness), so the script is for a human-run clean test. For CI, use the unit tests with an injected session, or add a future `--yes` mode.

## License

MIT. See `LICENSE`.