# Spike: verifying assumptions against a live 9Router

frugal's control-plane calls are guessed in `src/core/routerClient.ts`. This spike checks them against a real 9Router and records the answers, so the client can be corrected. Everything here is done by hand, on one machine, once.

## Prerequisites

1. Install the pinned 9Router release you intend to ship and start it bound to `127.0.0.1:20128`.
2. Set a dashboard password and an API key (as `frugal setup` will).
3. Add at least two free connections so a combo has something to fall back to. Add one deliberately broken/limited connection to force a 429.

Keep a notes file; record every endpoint, method, payload and observed behaviour.

## 1. Control API: combos

frugal assumes:

```
GET    /health
GET    /combos
POST   /combos   { "name": "free-best", "models": ["vendor/a:free", ...] }
DELETE /combos/<name>
```

Verify each: does `GET /health` exist? What is the real path and shape for listing and creating a combo? Inspect the dashboard's network tab while creating a combo, or read the 9Router source/docs. Then correct `routerClient.ts` and `composeAndRegister`.

Record:
- real endpoint + method + auth header
- request body shape (combo name, model list field name, strategy field)
- response shape and error codes

## 2. Auth surfaces

frugal generates an API key and a dashboard password. Confirm:
- `sk-…` key authenticates `/v1/*` (chat/models) but **not** `/api/*`.
- `/api/*` (usage, quota) needs the dashboard session/cookie.
- What `frugal watch`/`frugal mcp` (v0.2) must do to authenticate.

Record the login flow and which endpoints each credential opens.

## 3. Fallback on rate limit

Create a combo whose first model is the broken/limited connection and second is healthy. Send one chat request and observe:

```
curl -sS http://127.0.0.1:20128/v1/chat/completions \
  -H "Authorization: Bearer <frugal key>" -H "content-type: application/json" \
  -d '{"model":"free-best","messages":[{"role":"user","content":"hi"}]}'
```

Expected: a normal `200` from the second model, not a `429`. Confirm the combo strategy is `fallback` (not round-robin/fusion) and that the response identifies the model actually used (header or body). This is the core promise: a student must not see the error.

## 4. Context overflow is request-scoped

Send an oversized prompt (larger than the smallest combo member's window). Expected per 9Router docs: a `400` that does **not** trigger fallback. Confirm. This is why frugal relies on harness compaction rather than more fallback.

## 5. Combo context window in `/v1/models`

`curl -sS http://127.0.0.1:20128/v1/models` and find how a combo name reports its context window: the minimum across members, a default, or nothing? This decides whether the `limit.context` frugal writes into OpenCode is correct or needs to be computed differently.

## 6. Provider registration

Is there an API to add a provider connection with a key? If yes, frugal can hand keys to 9Router and delete its own `secrets.json` copy (the spec wants keys to live in 9Router's data dir). If no, document that keys stay in frugal's 0600 store until it exists.

## 7. Token saver and caching

Confirm the RTK token saver is on by default, how to bypass it per request, and whether it keeps a stable prompt prefix (so provider prompt caches still hit).

## 8. Harness specifics

- **OpenCode:** does writing `compaction` and `limit.context` on the model actually change compaction timing? Does OpenCode read the combo's declared window?
- **OpenCode Go:** real endpoint, limits, and whether its key works through a proxy.
- **Copilot Student:** does OpenCode's own sign-in work, and is Student data used for training?
- **Pi:** does its 9Router extension expose any compaction setting frugal can write?

## 9. Usage ranking source

The public `https://openrouter.ai/api/v1/models` has no usage field, and `/rankings` is Next.js flight data, not an API. Confirm one of:
- a stable OpenRouter ranking endpoint usable with a key, or
- that the instructor will publish a `usage.json` beside `results.json`.

Until then, usage ranking is configured with `frugal rankings --usage <url>` and is simply off when unset.

## Exit check

A hand-made `free-best` combo answers through OpenCode via 9Router, falls back on a 429 with no student-visible error, and every endpoint frugal calls has been corrected to the real one with a smoke test.
