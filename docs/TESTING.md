# Testing frugal

A practical checklist for a local run before a classroom rollout. Do the isolated smoke first, then the real setup.

## Prerequisites

- Node.js 22 or newer
- 9Router reachable on `127.0.0.1:20128` (frugal can install and start a pinned copy)
- The 9Router **dashboard password** (you set it in the dashboard; the default is `123456`)
- Free provider keys for whichever providers you plan to add

Keys go into 9Router, not frugal. The harness configs hold **9Router's own `sk-` key**, not provider keys. Do not share `~/.pi/agent/models.json` or `~/.config/opencode/opencode.json`.

## 1. Isolated smoke (does not touch your real 9Router)

```sh
npm install -g @michaelborck/frugal
npm run clean-test -- --dry-run     # or: scripts/frugal-clean-test.sh --dry-run
npm run clean-test                  # stops 20128 (asks), fresh DATA_DIR, test1234, cleans up
npm run clean-test -- --isolated-home --keep   # Pi/OpenCode configs in temp HOME, keep logs
```

Expected: 9Router starts, login succeeds, catalogs sync, providers can be added, a harness config is written, and the script stops/removes the temp instance.

## 2. Real 9Router setup

```sh
frugal setup                        # interactive
# or
FRUGAL_ROUTER_PASSWORD=... OPENROUTER_API_KEY=... \
  frugal setup --yes --provider openrouter,groq --harness pi --verify
```

Check:

- Provider adds validate and appear in 9Router → Providers.
- Cloudflare asks for **both** API token and Account ID.
- Requesty/CrowLLM create an OpenAI-compatible provider node, then the connection.
- `free-best` exists in 9Router **Combos** with the verified models and **Strategy: Fallback**.
- Pi: `~/.pi/agent/models.json` has a `9router` provider and still has `ollama` / `ollama-shared`.
- `pi --provider 9router --model free-best` answers.
- OpenCode (if chosen): provider `router9`, model `free-best`, compaction set.

## 3. Daily check

```sh
FRUGAL_ROUTER_PASSWORD=... frugal refresh            # sync, verify, update free-best
FRUGAL_ROUTER_PASSWORD=... frugal refresh --no-apply # preview
FRUGAL_ROUTER_PASSWORD=... frugal refresh            # run twice; should be idempotent
frugal reliability
```

Expected: the second run does not error, the combo becomes shorter/cleaner as dead ids drop, and reliability shows per-model pass rates and latency.

## 4. Failure cases worth trying

- Disable or exhaust one provider's key, then request: 9Router should fall through to the next model.
- Add a deliberately stale model id to the combo: `frugal refresh` should drop it.
- Run `frugal setup --yes` with no `FRUGAL_ROUTER_PASSWORD`/`FRUGAL_ROUTER_KEY`: should fail with a clear message.
- `frugal setup --yes --provider cloudflare-ai` with only a token: should skip and name the missing Account ID.
- Stop 9Router, then `frugal verify`: should fail cleanly, not hang.

## 5. Known gaps

- OAuth providers (Kiro, Gemini CLI, Copilot) use 9Router's browser flow; frugal does not automate them.
- The dashboard password must be set once by hand; non-interactive provisioning is a spike item.
- Combo writing needs the dashboard session (`/api/*`); the `sk-` key alone cannot create combos.
- `frugal watch` and `frugal mcp` are v0.2 ideas. A Tauri desktop app is optional/v0.3.
- Budget plans (OpenCode Go, Z.ai, ClinePass) are user-managed: connect in 9Router, make `budget-best` yourself.
- Free tiers churn; run `frugal refresh` daily and keep the combo short (8–10 verified models).

## 6. Reset

```sh
FRUGAL_HOME=/tmp/frugal-clean frugal stop
rm -rf /tmp/frugal-clean

# wipe the real 9Router (keep a backup):
lsof -nP -iTCP:20128 -sTCP:LISTEN
mv ~/.9router ~/.9router.bak
```

See `docs/SPIKE.md` for the live 9Router session/API details and `docs/SPEC.md` for the full design.