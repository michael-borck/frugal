# frugal — spec audit

Review of `docs/SPEC.md` (the "frugal and frugal-bench Project Specs" document, 16 Nov 2026), captured at scaffold time so decisions are not lost.

## Strengths

- Clear tier model (`free` / `budget`) with a hard monthly cap and flat-fee-only default.
- Four-source ranking with a defined fail-safe at every step (last good combo, ignore bad picks).
- Explicit `results.json` / `picks.json` / `user.json` contracts with `schema_version` and a compatibility rule.
- Acceptance criteria in section 6 are testable and concrete.
- Honest "unverified assumptions" and risk register; scope is phased against real milestones.

## Gaps and improvements (by impact)

1. **Architectural contradiction — RESOLVED (decision A).** Section 3 says every tool talks *only* to 9Router. Section 4 assigns per-request behaviour — context guard, cooldown, switch-back, quota reads — to frugal. frugal is a *configurator*: it writes files and exits, so it is not in the request path and cannot observe per-request prompt size, 429s, or reset times.

   **Decision: frugal stays a pure configurator (option A).** It installs 9Router, pre-builds the `free-best` and `budget-best` combos, registers them through 9Router's control API, and wires OpenCode / Pi / Msty. 9Router owns the request path: failover, cooldowns, context handling, quota reads. frugal never becomes a proxy. The §4 per-request features move to the spike as "verify 9Router does X; report it in `frugal doctor`." The scaffold reflects this: no cooldown state, combos written via the control API, and harness writers that only touch config files.

2. **Runtime state mixed with user intent.** Cooldowns, last-good combo, and per-session lock are mutable runtime state. Putting them in the user-editable `user.json` invites corruption. Recommendation: keep `user.json` for intent only, add a frugal-owned `state.json` for runtime state. (Done: `src/core/config.ts` separates them, and after decision A `state.json` no longer tracks cooldowns at all — only what frugal built.)

3. **Hosting of `results.json` / `picks.json` is unresolved** but is a hard MVP dependency. Pick a default host (e.g. an org-owned GitHub Pages URL) and allow override via `picks_url` / `results_url` in `user.json`.

4. **No license stated for frugal itself.** 9Router's license and Kindi's AGPL-3.0 are called out, but frugal's own license is not. This scaffold uses MIT (per decision) and should carry a `NOTICE` for third-party licenses.

5. **No minimum Node version.** `engines.node` should be set and documented. Scaffold sets `>=20`.

6. **No test strategy for frugal** — frugal-bench tests *models*, not the CLI. Add unit tests for ranking/merge logic and an integration test against a mock 9Router HTTP API. (Done: unit tests cover the merge/ranking core, combo building, and the OpenCode/Pi/Msty writers with backup/restore.)

7. **`picks.json` integrity.** Schema validation is good, but a compromised URL could ban all models (denial of service). Consider a signature or a pinned expected-schema plus field allowlist. (The spec already forbids code execution — good.)

8. **Port / instance conflicts.** `setup` does not say what to do if `127.0.0.1:20128` is already in use or two frugal instances run concurrently. Add detection and a clear error.

9. **Cap semantics for OpenCode Go conflict.** It is called a flat fee but "limits are a dollar value per period". Clarify how budget spend is tracked and when frugal stops using it.

10. **Missing frugal self-versioning / migration** for local files. `results.json` / `picks.json` have `schema_version`; local files should too. Scaffold includes `schema_version` in `user.json` and `state.json` and rejects unknown majors.

## Non-blocking for scaffold

These are spike-time items, not blockers: verifying 9Router's combo endpoint, OpenCode/Pi/Msty config shapes, 9Router cooldown/context behaviour, and Copilot Student integration.