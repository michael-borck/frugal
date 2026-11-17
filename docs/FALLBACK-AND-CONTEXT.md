# Fallback, context and compaction

Notes on what happens when the router switches models, and where compaction fits. frugal stays a configurator; none of this puts frugal in the request path.

## Quality can drop when the router switches models

9Router's combo fallback swaps to the next model silently. When it does, the assistant's quality, style and tool-call reliability can change mid-conversation. This is expected, not a bug.

- frugal-bench's tier/score predicts the drop but cannot prevent it.
- Order combos by tier (best model first) so the strongest model answers until it is exhausted.
- Tell students that a late-session answer may come from a weaker model.

## Context window is not a rate limit

These are two different things, and conflating them is what makes this feel unsolvable:

- **Rate limits** — requests and tokens per minute/day. They cause `429`s and drive *failover*. Free tiers may or may not publish them; you also discover them by hitting `429` (and 9Router reads the response headers).
- **Context window** — the maximum tokens a model accepts. It is a model property, published in the catalog (OpenRouter `/api/v1/models` `context_length`; 9Router `/v1/models`). It drives *compaction*, not failover.

So a provider that posts no rate-limit numbers does not stop us knowing when to compact: compaction keys off the model's context window, which is known independently of rate limits.

## The chicken-and-egg is mostly avoided natively

- 9Router classifies a `400` context-overflow as request-scoped and deliberately does **not** fail over. An oversized request will not burn through the combo.
- OpenCode compacts automatically near the model's window, and per its docs "recover[s] once when a provider rejects a request as too long." That is a native backstop after overflow.
- The real risk is a harness mis-detecting the **combo's** context window. A combo exposes one model name (`free-best`), and some clients (e.g. Cursor with custom endpoints) fall back to a fixed budget when they cannot see the true window. If the harness thinks `free-best` is 1M tokens while the smallest member is 128K, compaction fires too late.
  - Mitigations: keep the combo's minimum window high (the spec already filters below 128K); where the harness/provider schema allows a model context `limit`, have frugal declare the combo's **minimum** window; rely on OpenCode's one-shot overflow recovery as the last resort.

## frugal's role: configure, do not proxy

Harness priority: **OpenCode is the recommended default** (open, JSON-configurable, native auto-compaction, MCP). **Pi** is a supported lightweight alternative; **Msty.ai** is supported via guided paste with its own context handling outside frugal's control. The compaction config below is written where the harness supports it; OpenCode first.

1. **Write the harness's compaction settings.** OpenCode exposes a `compaction` block in `opencode.json` (`auto`, `buffer` as a share of the window or a token count, `keep.tokens`). frugal can write a conservative `buffer` so compaction starts earlier. (Spike: confirm the exact schema per harness and version.)
2. **Declare the combo's context window** where the provider model schema supports a `limit`/context, set to the minimum across the combo's members.
3. **Document** that long sessions should be compacted or restarted, and that quality may change after a switch.

## Optional awareness layers (v0.2, opt-in)

These make the transparent behaviour visible for power users. None of them can force a harness to compact, and neither puts frugal in the request path.

- **`frugal watch`** — polls 9Router's usage API (`/api/usage/stats`, `/api/usage/request-details`) for the last-served model, per-request prompt tokens (an approximation of current context size) and per-connection quota, then raises desktop notifications ("switched to gpt-oss-120b", "Groq daily limit 80% used", "context near limit"). Caveats: the `/api/*` surface needs the dashboard session, not the `sk-` key, and some connections answer "Usage not available".
- **`frugal mcp`** — an MCP server that exposes router status and quota as a read-only tool/resource inside supported harnesses (OpenCode first; Pi/Msty support varies). Useful for "how much quota is left?", but it cannot trigger compaction and costs a tool call.

| Layer | Transparent to user | Can trigger compaction | Runs outside harness | Cost |
| --- | --- | --- | --- | --- |
| Configurator writes harness compaction | yes | indirectly (sets threshold) | n/a | none |
| Declared combo context limit | yes | indirectly (correct threshold) | n/a | none |
| `frugal watch` notifications | yes (opt-in) | no | yes | a poll loop |
| `frugal mcp` status tool | yes | no | no (in-harness) | a tool call |

## Recommendation

Default experience: frugal configures 9Router combos **and** the harness's native compaction, so users do nothing and never hit the chicken-and-egg in normal use. Power users get opt-in `watch`/`mcp` and config overrides. Do not build a request-path proxy or a compaction daemon.
