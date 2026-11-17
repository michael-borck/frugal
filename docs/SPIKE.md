# Spike: verifying assumptions against a live 9Router

frugal's control-plane calls are guessed in `src/core/routerClient.ts`. This spike checks them against a real 9Router and records the answers, so the client can be corrected. Everything here is done by hand, on one machine, once.

## Prerequisites

1. Install the pinned 9Router release you intend to ship and start it bound to `127.0.0.1:20128`.
2. Set a dashboard password and an API key (as `frugal setup` will).
3. Add at least two free connections so a combo has something to fall back to. Add one deliberately broken/limited connection to force a 429.

Keep a notes file; record every endpoint, method, payload and observed behaviour.

## 1. Control API: combos

Confirmed from 9Router source: the real endpoints are `/api/combos` and `/api/combos/[id]` behind a dashboard session, not `/combos` with the API key. See section 12.

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

For the reliability ledger, confirm that `/api/usage/request-details` (or an equivalent) returns, per request, the model used, the HTTP status, and latency. Those three fields are all `frugal watch` needs to append request-outcome observations that drive the recency-weighted reliability ranking.

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

## 10. Non-interactive provisioning

`frugal setup` must set the dashboard password and API key without a human clicking around the dashboard. Determine whether 9Router accepts them via environment variables, a config/data file, or a first-run CLI flag. Record the exact mechanism and where the data directory lives, so RouterManager can provision it after install and so `secrets.json` can hand keys to 9Router if a registration API exists.

## 11. Provider catalogs and custom connections

Most providers are OpenAI-compatible and expose `GET /v1/models`, so the standard way to get a fresh model list is that endpoint. Confirm for a live 9Router:

- Can you add a provider as a **custom OpenAI-compatible connection** (base URL + key) so 9Router fetches that provider's own `/v1/models` instead of its bundled cached catalog? Try OpenRouter (`https://openrouter.ai/api/v1`), Requesty (`https://router.requesty.ai/v1`), Kilo (`https://api.kilo.ai/api/gateway`).
- Does 9Router namespace model ids per connection (for example `cf/…`, `kgw/…`), and how does that map to the provider's unprefixed ids?
- Is there any refresh of a connection's model list, via UI or API?
- Does the dashboard session (not the `sk-` key) expose endpoints to list/add connections and create combos? Record the exact auth (cookie/JWT) and routes.

## Live findings (recorded 2026-11-17)

From a real 9Router with OpenCode Free, OpenRouter, NVIDIA, Cloudflare, Kimchi, Kilo and GLM connections:

- `/v1/models` returned 74 ids, but many were stale or unusable: `nvidia/…` 404, `kimchi/…` 503, `glm/…` 503, `oc/…` 502, `openrouter/typesafe/jev-1.13` 400 (a decisions model, not chat), and a Kilo `:free` id 404. Only some Cloudflare models and `kgw/kilo-auto/free` answered.
- `/api/*` returns **401 with the `sk-` API key**; combos and providers need the dashboard session. `GET /combos` is 404. So frugal cannot read or create combos with the key alone.
- There was **no visible UI to refresh** a connection's model list.
- `:free` in an id is not a price or availability guarantee.
- **Ollama Cloud is no longer a free option**; treat it as paid.
- The only reliable signal was a live request. `frugal verify` now probes a spread of ids and records pass/fail/latency.

## 12. Session API (confirmed from 9Router source, 2026-11-17)

The control API is under `/api/*` and needs a dashboard session, not the `sk-` key. The cookie is `auth_token`.

Login (the dashboard password; default is `123456` until changed):

```sh
curl -c /tmp/9r.cookies -X POST http://127.0.0.1:20128/api/auth/login \
  -H 'content-type: application/json' -d '{"password":"<dashboard password>"}'
curl -b /tmp/9r.cookies http://127.0.0.1:20128/api/auth/status
```

Then, with `-b /tmp/9r.cookies`:

| Purpose | Request |
| --- | --- |
| List combos | `GET /api/combos` → `{ combos: [...] }` |
| Create combo | `POST /api/combos` `{"name":"free-best","models":["..."],"kind":null}` |
| Update combo | `PUT /api/combos/<id>` (changed fields; name regex `[A-Za-z0-9_.-]+`) |
| Delete combo | `DELETE /api/combos/<id>` |
| Refresh provider catalogs | `POST /api/models/catalog-sync` (status: `GET`) |
| Test one model | `POST /api/models/test` `{"model":"..."}` |
| Validate a provider key | `POST /api/providers/validate` `{provider, apiKey, providerSpecificData?}` |
| Create a connection | `POST /api/providers` `{provider, apiKey, providerSpecificData?}` (409 = already exists) |
| List/create provider nodes | `GET/POST /api/provider-nodes` `{name, prefix, baseUrl, apiType:"chat", type:"openai-compatible"}` |
| API keys | `GET/POST /api/keys` |

`/v1/*` (chat, models) still uses the `sk-` key. `/api/*` uses the session cookie. That split is why frugal cannot create combos with the API key alone.

Provider ids confirmed from the registry: `opencode` (noAuth), `openrouter`, `groq`, `cloudflare-ai` (token + `providerSpecificData.accountId`), `kilo-gateway`, `nvidia`, `mistral`, `gemini`. No-auth providers still require a non-empty `apiKey` on the create route, so send a placeholder (e.g. `no-auth`); the transport ignores it.

Custom OpenAI-compatible providers (for example Requesty at https://router.requesty.ai/v1 and CrowLLM at https://crowllm.com/v1) are created as provider nodes first; the returned node id (openai-compatible-chat-...) is then used as the provider when creating the connection, and the node prefix becomes the model namespace.

The `9router` CLI also has an interactive ASCII menu with **Providers**, **Combos**, **API Keys**, **Settings**, and **CLI tools** screens, so the same configuration can be done in the shell without curl.

Implemented: frugal setup now logs in with the dashboard password (held in memory, never stored), runs catalog-sync, reuses or creates the sk- API key via /api/keys, and upserts free-best with the Fallback strategy via /api/combos and /api/settings. If login is skipped it falls back to the API key and a paste-ready order.

## Exit check

A hand-made `free-best` combo answers through OpenCode via 9Router, falls back on a 429 with no student-visible error, and every endpoint frugal calls has been corrected to the real one with a smoke test.
