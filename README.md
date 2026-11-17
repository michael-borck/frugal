# frugal

One command to a working, auto-failover coding setup. frugal is a **configurator**: it installs and configures a local 9Router, pre-builds ranked fallback combos (`free-best`, and `budget-best` on the budget tier) from the best free, local and optional low-cost models, and wires them into the student's harness.

Harness support: **OpenCode is the recommended default** (open, JSON-configurable, native auto-compaction, MCP). **Pi** is supported as a very light-weight alternative via its 9Router extension. **Msty.ai** is supported through a one-time guided paste.

frugal never sits in the request path. Once configured, the student's tools talk only to 9Router; 9Router owns failover, cooldowns, and quota handling, and the harness owns compaction. frugal's job is to make that setup one command, keep the combos current, and configure the harness's compaction so the common case never hits an overflow.

> Status: early build. Working now: the command surface; the configurator core (combo building, 9Router registration); a RouterManager that can detect, install (pinned, local), start and stop 9Router; live free-model discovery from OpenRouter; a runnable interactive `setup` (tier, cap, provider key validation, local mode, optional router install); harness writers for OpenCode (provider, compaction, declared context limit), Pi, and Msty; local server detection; secure key storage; `frugal add`/`remove`/`rankings`; and `doctor`. Remaining spike items: verifying the 9Router combo API and non-interactive provisioning against a live instance, and the usage-ranking source. `frugal watch` and `frugal mcp` are v0.2; a Tauri desktop app is v0.3. See `docs/SPEC.md`, `docs/FALLBACK-AND-CONTEXT.md`, `docs/SPIKE.md`, and `docs/AUDIT.md`.

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
| `frugal models` | List the combo in order |
| `frugal prefer` / `ban` / `lock` / `reset` | Student overrides |
| `frugal tier free\|budget` | Switch tier |
| `frugal local mode fallback\|first\|only` | Set local model behaviour |
| `frugal providers` | List enabled providers and key status |
| `frugal add <provider>` / `frugal remove <provider>` | Guided key entry and validation, or disconnect and delete the key |
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

The combo order comes from, in priority: student pins/bans, instructor `picks.json`, `frugal-bench` `results.json`, then usage rank and model name. All three hosted sources are optional and set with `frugal rankings`:

```sh
frugal rankings --results https://class.example/results.json \
                --picks   https://class.example/picks.json \
                --usage   https://class.example/usage.json
```

When a source is unset or unreachable, frugal falls back gracefully (no hardcoded placeholder URLs). The usage source is deliberately pluggable: OpenRouter's public models API exposes no usage field, so either point `--usage` at a hosted ranking the instructor publishes, or at a verified OpenRouter ranking endpoint once the spike confirms one.

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