# frugal

One command to a working, auto-failover coding setup. frugal is a **configurator**: it installs and configures a local 9Router, pre-builds ranked fallback combos (`free-best`, and `budget-best` on the budget tier) from the best free, local and optional low-cost models, and wires them into the student's harness.

Harness support: **OpenCode is the recommended default** (open, JSON-configurable, native auto-compaction, MCP). **Pi** is supported as a very light-weight alternative via its 9Router extension. **Msty.ai** is supported through a one-time guided paste.

frugal never sits in the request path. Once configured, the student's tools talk only to 9Router; 9Router owns failover, cooldowns, and quota handling, and the harness owns compaction. frugal's job is to make that setup one command, keep the combos current, and configure the harness's compaction so the common case never hits an overflow.

> Status: scaffold. The command surface, configurator core (combo building, 9Router registration), harness writers (OpenCode, Pi, Msty) with backup/restore, and unit tests are in place. The `frugal watch` and `frugal mcp` observability commands are planned for v0.2. Spike items (real 9Router combo API, candidate discovery, local model detection, interactive setup, harness compaction config) are next. See `docs/SPEC.md` for the specification, `docs/FALLBACK-AND-CONTEXT.md` for how failover, context and compaction work, and `docs/AUDIT.md` for the review behind this scaffold.

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
| `frugal report` / `update` / `uninstall` | Upkeep |

Every command accepts `--json` where it prints data, so pilot results can be collected by script.

## Configuration

- `user.json` — the student's intent: tier, cap, pins, bans, lock, local mode, enabled providers.
- `state.json` — frugal-owned runtime state: last good combo, cooldowns, refresh time.
- Both live under the OS app-support directory (`FRUGAL_HOME` overrides it for testing) and carry a `schema_version`.

## Development

```sh
npm install
npm run dev -- status      # run from source with tsx
npm test                   # unit tests
npm run typecheck
npm run build              # emit dist/
```

## License

MIT. See `LICENSE`.