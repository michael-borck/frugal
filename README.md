# frugal

One command to a working, auto-failover coding setup: installs and configures a local [9Router](https://example.invalid/9router), builds a ranked fallback chain of free, local and optional low-cost models, and wires it into OpenCode, Pi, and Msty.

> Status: scaffold. The command surface, configuration model, and ranking/merge core are in place with unit tests. The spike items (real 9Router combo API, tool config writers, local model detection, interactive setup) are next. See `docs/SPEC.md` for the full specification and `docs/AUDIT.md` for the review behind this scaffold.

## Requirements

- Node.js 20 or newer
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