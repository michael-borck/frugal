# frugal

One command to a working, auto-failover coding setup. frugal is a **configurator**: it installs and configures a local 9Router, pre-builds ranked fallback combos (`free-best`, and `budget-best` on the budget tier) from the best free, local and optional low-cost models, and wires them into the student's harness.

Harness support: **OpenCode is the recommended default** (open, JSON-configurable, native auto-compaction, MCP). **Pi** is supported as a very light-weight alternative via its 9Router extension. **Msty.ai** is supported through a one-time guided paste.

frugal never sits in the request path. Once configured, the student's tools talk only to 9Router; 9Router owns provider connections and API keys, failover, quota, usage charts and the token saver, and the harness owns compaction. frugal's job is to make that setup one command, verify which models actually answer, apply the ranked combo, and wire the harness.

**Scope:** frugal is deliberately thin — an opinionated installer/configurator for 9Router, not a router. Provider keys and connections live in 9Router. Power users can configure 9Router directly and ignore frugal; frugal must never get in the way.

> Status: early build. Working now: the command surface; a RouterManager that detects, installs (pinned, local), starts and stops 9Router; an interactive `setup` (tier, cap, local mode, optional router install); `frugal verify` (probe advertised models, keep responders); the reliability ledger and `frugal reliability`; catalog/usage/picks configuration via `frugal rankings`; harness writers for OpenCode (provider, compaction, context limit), Pi and Msty; local server detection; `doctor`/`status`. Provider key entry still exists but the thin scope moves keys into 9Router; trimming it is next. Remaining spike items: 9Router's combo/provider API (currently dashboard-session only) and non-interactive provisioning. `frugal watch` and `frugal mcp` are v0.2; a Tauri desktop app is v0.3. See `docs/SPEC.md`, `docs/FALLBACK-AND-CONTEXT.md`, `docs/SPIKE.md`, and `docs/AUDIT.md`.

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
| `frugal status` | Mode, combo order, cooldowns, quota, next step |
| `frugal doctor` | Checks every link in the chain; `--fix` applies safe fixes |
| `frugal start` / `stop` | Start or stop the router service |
| `frugal refresh` | Rebuild combos from the latest rankings and picks |
| `frugal verify` | Probe the models 9Router advertises and keep only the ones that answer |
| `frugal models` | List the combo in order |
| `frugal prefer` / `ban` / `lock` / `reset` | Student overrides |
| `frugal tier free\|budget` | Switch tier |
| `frugal local mode fallback\|first\|only` | Set local model behaviour |
| `frugal providers` | List enabled providers and key status |
| `frugal add <provider>` / `frugal remove <provider>` | Point to 9Router's provider screen; keys and connections live in 9Router |
| `frugal rankings` | Configure the hosted `results.json`, `picks.json` and usage ranking URLs |
| `frugal reliability` | Show observed success and latency per provider/model over time |
| `frugal report` / `update` / `uninstall` | Upkeep |

Every command accepts `--json` where it prints data, so pilot results can be collected by script.

## Configuration

- `user.json` — the student's intent: tier, cap, pins, bans, lock, local mode, enabled providers, and the hosted ranking URLs.
- `state.json` — frugal-owned runtime state: the last good combo and refresh time. (Cooldowns and quota belong to 9Router, not here.)
- `secrets.json` — provider keys, mode `0600`, never written to any harness config.
- `observations.jsonl` — a local reliability ledger: timestamped pass/fail and latency per provider/model (no prompts, no keys). Kept for 90 days, pruned at most once a day. Summarised by `frugal reliability` and used as a ranking tiebreak.
- All live under the OS app-support directory (`FRUGAL_HOME` overrides it for testing) and carry a `schema_version`.

## Ranking sources

Where the candidate models come from: `frugal-bench`'s published **`catalog.json`** by default (`https://raw.githubusercontent.com/michael-borck/frugal-bench/main/catalog.json`), filtered to the student's enabled providers and tier. If the catalog is unreachable, frugal falls back to a live OpenRouter free-model fetch. Connect providers in 9Router; the thin direction is to treat 9Router's connected models as the source and the catalog as optional enrichment.

The combo order comes from, in priority: student pins/bans, instructor `picks.json`, `frugal-bench` `results.json`, then bench availability, observed reliability, usage rank and model name. All hosted sources are optional and set with `frugal rankings`:

```sh
frugal rankings --catalog https://class.example/catalog.json \
                --results https://class.example/results.json \
                --picks   https://class.example/picks.json \
                --usage   https://class.example/usage.json
```

When a source is unset or unreachable, frugal falls back gracefully (no hardcoded placeholder URLs, except the default catalog above). The usage source is deliberately pluggable: OpenRouter's public models API exposes no usage field, so either point `--usage` at a hosted ranking the instructor publishes, or at a verified OpenRouter ranking endpoint once the spike confirms one.

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