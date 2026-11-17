### frugal and frugal-bench: Project Specs
Nov 16, 2026 · @Michael Borck
### 1. Overview
Students who cannot afford AI subscriptions need coding agents that keep working when one free quota runs out, with no setup skill required. Two projects deliver that: frugal (a one-command installer and updater that configures a local 9Router with a ranked fallback chain of free, local and optional low-cost models and wires it into the student's tools) and frugal-bench (a separate automated benchmark that measures free, low-cost and local models and publishes the ranking frugal uses).
Goals
A student goes from nothing to a working, auto-failover coding setup in under 10 minutes, with two short signups (OpenRouter and Groq) as the only manual steps.
The default model order is data-driven and refreshed automatically, with no per-run human judgment.
The instructor can override the ranking centrally through one small hosted file.
Works with OpenCode and Pi, and with Msty through a one-time guided paste.
Non-goals
Not a hosted service: each student runs their own router on their own machine, with their own accounts and keys.
No sharing of keys or accounts, and no creating extra accounts to evade limits.
No paid routing by default: paid plans only in the opt-in budget tier, under the cap, and never Claude or ChatGPT subscriptions.
No attempt to make free models match paid ones; the goal is the best available order.
How the two projects relate
They share one interface, two static files: the ranking file (results.json) from frugal-bench and the instructor's override file (picks.json), both read by frugal. frugal must work without frugal-bench by falling back to usage-based ranking from OpenRouter, so the projects can be built and shipped independently.
Naming. The project is frugal: students type the command frugal, the npm package is frugalrouter (the bare name is probably taken), and the benchmark is frugal-bench. It was renamed from the working names freerouter and then cheaprouter, because "free" overpromised once paid tiers were added and "cheap" read as low quality. The tier name free and the combo name free-best keep their names because they describe the free tier.
Tiers. One setting, tier, decides which providers frugal may use.
Tier
Default
Includes
Cost to the student
free
Yes
Free providers only, plus Copilot Student for verified students and a local model if one is installed
$0
budget
No
The free providers plus one or two paid plans from the approved list
Up to the cap
The cap is max_monthly_usd, with a ceiling of $40 that the instructor can lower. frugal refuses to enable a plan whose listed price exceeds the cap. Flat-fee subscriptions cannot overspend; per-token API keys can, so they are not offered by default and need a spend limit set at the provider.
Order of preference. The default order comes from frugal-bench, and the student can override it. Highest priority first: (1) the student's own pins and bans, (2) the instructor's picks, (3) the frugal-bench tier and score, (4) OpenRouter usage rank as the tiebreaker. A student can also lock a single model, which turns off failover for that session.
Local models. frugal handles a locally installed model (through Ollama, llama.cpp or Kindi) as a first-class provider alongside the cloud free models, not as an afterthought. A local_mode setting, stored in user.json, decides how local and cloud models combine (section 4). The instructor runs frugal-bench and publishes the local reference results so that students can read them and make up their own minds; the reference informs the choice but never makes it for them.
### 2. Project 1: frugal, scope and requirements
frugal is a cross-platform command-line tool that installs and configures a pinned version of 9Router for one student, keeps its combos current, and connects the student's coding tools to it.
Users
User
Needs
Student
One install command, two short signups, a tool that just works, clear plain-language errors
Instructor
Central control of the model order, a way to push a new default to everyone, a way to see what is broken
Functional requirements
ID
Requirement
Priority
F1
Install a pinned, checksum-verified 9Router release and start it as a local service
Must
F2
Set a random dashboard password and API key during setup; never use defaults
Must
F3
Prompt for the student's own OpenRouter API key and validate it with a test call
Must
F4
Enable the OpenCode Free provider (no auth) automatically
Must
F5
Build the ranked combos (free, local and, on the budget tier, paid models) and register them with 9Router through its HTTP API
Must
F6
Refresh the combo on startup and weekly, and when the model list changes
Must
F7
Write the OpenCode config and install the Pi 9Router extension
Must
F8
Print or copy the exact Msty provider settings with a short numbered guide
Should
F9
doctor command that checks every link in the chain and says what to fix
Must
F10
Fetch the instructor's picks.json and merge it with the automatic ranking
Should
F11
Keep the last good combo if any network fetch fails
Must
F12
Optional extra free providers (for example Kiro) with guided OAuth
Could
F13
Uninstall that restores each tool's original config from backups
Should
Added requirements: tiers, overrides and failover
ID
Requirement
Priority
F14
tier and max_monthly_usd settings; refuse to enable a paid plan above the cap
Must
F15
Student overrides: prefer, ban and lock commands, stored locally and applied above all other ranking
Must
F16
Skip models whose context window is smaller than the current request
Must
F17
Cooldown on rate-limited models until their reset time, then return to the better model
Must
F18
Read remaining OpenRouter free requests from its API instead of probing
Should
F19
Optional paid providers (OpenCode Go, ClinePass) added as OpenAI-compatible API-key connections
Should
F20
Guide eligible students to activate Copilot Student and connect it directly in OpenCode
Should
F21
Keep 9Router's token saver on by default and offer a per-request bypass
Should
F22
Treat a local model server (Ollama, llama.cpp, Kindi) as a first-class provider with a local_mode setting of fallback, first or only
Must
Platforms: Windows, macOS and Linux, with Node.js as the only prerequisite. If Node is missing, the installer says so and links to the installer; it does not install it silently.
### 3. Project 1: architecture, commands and setup flow

frugal and frugal-bench architecture · 2 projects, 1 interface
frugal is the only piece on the student's machine. It pulls rankings from the hosted files and OpenRouter, builds the combo in 9Router, and the three tools talk only to 9Router, except Copilot Student, which connects inside OpenCode.
Commands
Group
Command
What it does
Everyday
frugal setup
First-time wizard: install, keys, tier, local detection and tool wiring; safe to re-run
Everyday
frugal status
Mode, combo order, active model, cooldowns, remaining quota and a suggested next step
Everyday
frugal doctor
Check every link in the chain and print the fix; --fix applies the safe ones
Everyday
frugal start / frugal stop
Start or stop the managed 9Router (start installs the pinned version locally on first use); start refreshes the combo if it is older than 24 hours
Everyday
frugal refresh
Rebuild the combos now from the latest rankings and picks
Everyday
frugal verify
Probe the models 9Router advertises (a spread across providers, configurable limit) and report which actually answer, with a suggested combo order; records the results in the reliability ledger
Models
frugal models
List the combo in order with source (local, free, paid), score tier and state
Models
frugal prefer, ban, lock, reset
Student overrides (section 4)
Settings
frugal tier free|budget
Switch tier; budget asks the student to confirm the price against the cap
Settings
frugal local mode fallback|first|only
Set local_mode (section 4)
Settings
frugal local check
Benchmark the local model on this GPU and compare it with the top free cloud model
Settings
frugal rankings
Configure the hosted catalog.json, results.json, picks.json and usage ranking URLs; results, picks and usage are optional and unset means a graceful fallback, while catalog.json defaults to the instructor's published copy
Upkeep
frugal reliability
Show observed success rate, recency-weighted score and latency per provider and model over a time window
Providers
frugal providers
List enabled providers and whether each key works
Providers
frugal add <provider> / frugal remove <provider>
Guided signup, key test and connection, or disconnect and delete the key
Upkeep
frugal report
Open the instructor's published benchmark reference
Upkeep
frugal update
Update frugal itself; each release pins its own tested 9Router version
Upkeep
frugal uninstall
Stop everything and restore each tool's original config from backup
Observability (v0.2, optional)
frugal watch
Poll 9Router's usage API (last-served model, per-request prompt tokens, per-connection quota) and raise desktop notifications; informational only
Observability (v0.2, optional)
frugal mcp
Run a read-only MCP server that exposes router status and quota as a tool/resource inside supported harnesses (OpenCode first)
CLI rules
Every command works with no flags in normal use and is safe to run twice.
Errors say what to type next, for example "Groq key rejected. Run frugal add groq to replace it."
status, models and providers accept --json, so pilot results can be collected by script.
frugal on its own prints status and the five everyday commands, so a lost student always has a starting point.
Setup flow
Check that Node.js is installed; if not, explain how to get it and stop.
Detect a running 9Router on 127.0.0.1:20128. If one answers, reuse it and never touch it. If none answers, offer (default yes) to install the pinned release into frugal's own directory and start it as a managed process; install locally, not globally, so no sudo is needed and uninstall is clean. Never install silently, and never use a floating "latest".
Set a random dashboard password and API key, or confirm a config path that lets frugal provision them (spike item: how 9Router accepts them non-interactively).
Show the privacy notice, then ask for the student's OpenRouter key and test it.
Enable OpenCode Free, then guide the student through signing up for and testing the default providers (OpenRouter and Groq), and offer the optional ones. Detect any local model server (Ollama, llama.cpp or Kindi) and offer to add it.
Ask for the tier and local_mode, then fetch rankings and picks, and build the free-best combo, plus budget-best on the budget tier.
Configure OpenCode and Pi, and show the Msty paste guide.
Run doctor and send one test message through the router.
Router lifecycle. A RouterManager owns 9Router on every platform: detect, install (pinned, local), start (spawn detached with a pidfile and a logfile), stop, update (bump the pin with a frugal release, then smoke test) and uninstall. The same manager backs frugal start/stop and, later, the desktop app. The CLI is the canonical interface; the desktop app is an optional shell over the same core.
First use requires Node. Removing that requirement is the desktop app's job (see section 11): it bundles a Node runtime and 9Router so a low-tech student double-clicks one installer.
### 4. Project 1: ranking, providers, tiers and failover
The combo is built in four steps, and each step must fail safe: if any input is unreachable, frugal keeps the last good combo and says so in doctor.
Candidates. Prefer the published catalog.json from frugal-bench, which lists each provider's models with a computed free or budget access, context window and capability flags; keep only models from the student's enabled providers and tier. When no catalog is available or it is unreachable, fall back to fetching OpenRouter's model list and keeping entries whose prompt and completion price is $0 (the :free models). Also add the models served by other enabled providers: free providers such as OpenCode Free, a local server, and on the budget tier their paid plan.
Filters. Drop any candidate that is not text-output, lacks tool-calling support, has a context window below 128K tokens (configurable; local models use a lower minimum of their own, since they rarely run at 128K), or is on the instructor's ban list. This removes safety classifiers, rerankers and tiny models that appear in free lists but are useless for coding agents.
Verification. A model list is a hint, not proof: 9Router caches provider catalogs, provider /v1/models lists can be stale, a :free suffix is not a price guarantee, and an advertised model may 404 or be exhausted. frugal verify probes a spread of the advertised models across providers (default a small limit, configurable) with a one-token request and classifies the outcome: 200 is eligible, 429 means cool down until reset, 404 or 400 means stale and is dropped, 5xx means the provider is degraded. Results are timestamped in the reliability ledger and drive the ranking. Only models that answered should be placed in a combo; if too few pass, frugal keeps the last good combo. Probing spends a small amount of quota, so the default is a limited, cached probe of the candidates that could enter the combo, not the whole list, and a no-probe path exists. Combo writing is currently dashboard-manual because 9Router's /api needs a dashboard session, not the API key; frugal prints a paste-ready order until that is confirmed in the spike.
Score. Order by the first source available, in this priority:
frugal-bench results.json composite score, grouped into tiers (see section 8)
Bench availability, then locally observed reliability, as tiebreakers within a tier. Within a tier frugal orders by availability first, then by the reliability ledger's recency-weighted success rate, then by usage rank.
Usage rank, as the fallback and as the tiebreaker within a tier. The usage source is pluggable and configured with frugal rankings --usage, because OpenRouter's public models API exposes no usage field and its rankings page is not a stable API. The instructor can publish a usage.json beside results.json, or point at a verified OpenRouter ranking endpoint once the spike confirms one. When no usage source is configured, the tiebreak is model name.
Merge instructor picks. Apply picks.json: pinned models go first in the stated order, banned models are removed, preferred models get a bonus within their tier. Then apply the student's own overrides (section 10 merge order), cap the combo at 8 to 10 entries and write it to 9Router; the free tier's combo is named free-best.
Hosted sources are optional. results.json, picks.json and usage.json are each optional; an unset or unreachable source is skipped and the next tiebreak is used, so frugal never depends on a hardcoded placeholder URL.
Reliability ledger. frugal appends timestamped observations to a local observations.jsonl: catalog and key checks, router health and local-server probes it already performs, and, once frugal watch exists, real request outcomes read from 9Router's usage API (success, 429, latency, model). frugal reliability summarises the last N days per provider and per model: raw success rate, a recency-weighted (EWMA) success score, consecutive failures, last OK and last fail times, and median latency. The EWMA score is the ranking tiebreak described above, and a provider whose recent success collapses is pushed down even if an older benchmark still likes it. Observations contain provider and model ids, status codes, latency and timestamps only: never prompts, never keys, never uploaded. Raw observations are kept for 90 days and pruned at most once a day; the summaries are what ranking uses.
Ranking caveat. Usage rankings measure adoption, not quality, so they are a fallback and tiebreaker only. When frugal-bench results are older than 45 days, frugal warns in doctor and relies more on usage rank.
Refresh triggers
On every frugal start, if the combo is older than 24 hours.
Weekly via the OS scheduler.
When the free model list differs from the last run: a removed model leaves the combo immediately; a new model enters only once frugal-bench has scored it, or after a 7-day grace if the benchmark is unavailable.
Request limits. The combo cannot raise OpenRouter's per-account free cap (20 requests per minute, and 50 per day until $10 has ever been purchased, then 1,000 per day). Its job is to spread requests across providers, so the default setup must include at least one provider besides OpenRouter.
Provider list and accounts
9Router runs locally and is not an online broker; it forwards requests to the providers below, so each student needs an account with every provider they enable. The default set needs only two signups (OpenRouter and Groq). Limits and data terms below come from third-party surveys read in September and October 2026 and must be re-checked against each provider's own page before rollout.
Provider
Role
Account
Free limit or price (verify)
Data terms (verify)
OpenCode Free
Default
None
Model list varies and changes
Assume prompts may be logged
OpenRouter :free models
Default
Free signup
20 requests/min; 50/day, or 1,000/day after $10 lifetime purchases
Depends on who serves the model; may log
Groq
Default
Free signup, no card
Published per model; exact limits shown in the account's limits page
States it does not train on API data
GitHub Copilot Student
Optional, free for verified students
GitHub Education verification, re-checked monthly
AI-credit allowance with no published number; auto model selection only
GitHub may train on individual-plan data unless opted out; Student plan unconfirmed
Mistral
Optional
Free signup, no card
Lowest limits, shown only in the console
May train; opt-out toggle in the Admin panel
Google Gemini API
Optional
Google account
Shown only in AI Studio; tightened in 2026
May train on free-tier data outside the EEA, Switzerland and the UK
Cloudflare Workers AI
Optional
Free signup
Daily allowance
States it does not train on API data
NVIDIA API Catalog
Optional
Developer Program signup
No numeric limits published
Not stated
Kiro
Optional
Login through OAuth
About 50 credits per month
Unverified
OpenCode Go
Optional, paid (budget tier)
Subscription, API key
$10/month ($5 first month); Go Plus $40. Limits are a dollar value per period and sources disagree
One review reports zero retention; unverified
ClinePass
Optional, paid (budget tier)
Subscription; key reported to work outside Cline
$9.99/month ($4.99 first month)
Unverified
Z.ai GLM, Kimi, Chutes and similar plans
Candidates, paid (budget tier)
Subscription
About $10 to $20 at entry
Some plans restrict the key to named tools; check terms before routing through 9Router
CrowLLM
Optional, not default (candidate)
Free signup; API key
Has :free models, but the :free suffix is not a price guarantee (some are billed per request) and the public /v1/models does not expose pricing; some free coding models measured ~10% success and ~29s latency
Solo-run aggregator; terms change without much notice; one account per user; keep out of the default set and rank only after frugal-bench measures it
Requesty
Optional, not default (candidate)
Free signup; API key; no card for free models
Free models about 200 requests/day and 20/min shared; public /v1/models exposes input/output price, context and tool support
Aggregator at router.requesty.ai/v1; verify free-model set and terms per term
Kilo AI Gateway
Optional, not default (candidate)
Free signup or anonymous; API key
Free models about 200 requests/hour per IP; public /v1/models exposes isFree and mayTrainOnYourPrompts
Aggregator at api.kilo.ai/api/gateway; surface the prompt-training flag to students
Local server (Ollama, llama.cpp, Kindi)
Optional, first-class
Install an engine and a model; no account
No quota; limited by the student's GPU and model size
Stays on the student's machine
Not included. Claude Pro or Max and Codex or ChatGPT subscriptions are out of scope. Anthropic's terms restrict subscription sign-in to Claude Code and claude.ai, and it has enforced that against third-party tools including OpenCode, so routing a Claude subscription through 9Router risks account suspension; a Claude API key bills per token and is not subscription pricing. OpenAI is more permissive toward third-party tools, but these plans cost more than the student cap and should not be routed through a proxy without checking OpenAI's current terms. xAI (Grok) subscriptions are tied to its own CLI, and API use bills per token. Meta's Muse Spark is offered through a usage-based API and has no known free or subscription option. Cerebras credits require a verified payment method, and Cohere offers only a trial key. OpenCode Zen is pay-as-you-go and is not part of the student setup.
Rules
Every provider is added as a separate 9Router connection with the student's own key; keys are never shared between students.
frugal-bench records each provider's observed errors and limits per run, so published limits are never trusted blindly.
The setup flow explains each signup in two or three plain steps and tests the key before enabling the provider.
Tiers and spending cap
The free tier builds one combo, free-best, from free providers only. The budget tier builds budget-best: models from the student's paid plan come first, ranked by frugal-bench score, with the free models after them as overflow when the plan's limit is reached.
Setup asks for the tier, defaulting to free. Choosing budget requires the student to confirm the plan's monthly price and the cap in plain words.
Only flat-fee plans are offered. Per-token API keys sit behind an advanced flag and require a spend limit set at the provider.
The paid plan must permit use through a generic OpenAI-compatible endpoint. A plan that restricts its key to named tools is not offered until its terms are checked.
Student overrides
Command
Effect
frugal models
Shows the combo in order and each model's state
frugal prefer <model>
Puts the model first; failover continues beneath it
frugal ban <model>
Removes the model from the combo
frugal lock <model>
Uses only this model with no failover, with a warning that errors will follow when its quota runs out
frugal reset [model]
Clears one override, or all of them
Overrides are stored in a local user.json (section 10) and survive refreshes. If a preferred model disappears from the free list, frugal drops it from the active combo, tells the student, and restores it automatically if it returns.
Failover, compaction and switch-back
Division of responsibility. frugal is a configurator and never sits in the request path. 9Router owns failover, cooldowns, quota tracking and context handling; the harness owns compaction. frugal's job here is to configure both correctly and to document the behaviour. See docs/FALLBACK-AND-CONTEXT.md.
Quality fall-off. Because a combo fails over silently, the assistant's quality, style and tool-call reliability can change mid-conversation when the router switches models. This is expected. frugal-bench's tiers predict the drop but cannot prevent it; combos are ordered by tier so the best model answers first. Students are told that a late-session answer may come from a weaker model.
Context window is not a rate limit. Rate limits (requests and tokens per minute/day) cause 429s and drive failover; they may be published by the provider or discovered from response headers or by hitting 429. The context window is the maximum tokens a model accepts; it is a model property published in the catalog (OpenRouter /api/v1/models context_length, 9Router /v1/models) and it drives compaction, not failover. A provider that posts no rate-limit numbers therefore does not prevent knowing when to compact, because compaction keys off the known context window.
The chicken-and-egg is mostly avoided natively. 9Router classifies a 400 context-overflow as request-scoped and deliberately does not fail over, so an oversized request does not burn through the combo. OpenCode compacts automatically near the model's window and recovers once when a provider rejects a request as too long. The remaining risk is a harness mis-detecting the combo's context window, because a combo exposes one name (free-best) and some clients fall back to a fixed budget when they cannot see the true window; if the harness assumes the combo is larger than its smallest member, compaction fires too late.
frugal's role. (1) Write the harness's own compaction settings where supported: for OpenCode, the compaction block (auto, buffer as a share of the window or a token count, keep.tokens), set conservatively. (2) Where the provider model schema allows a context limit, declare the combo's minimum window across its members. (3) Document that long sessions should be compacted or restarted. This fires compaction before the smallest fallback is reached, so the common case never hits overflow. frugal does not summarize on its own and does not become a proxy.
Cooldown. 9Router marks a rate-limited model unavailable until the reset time in the response (or a default backoff) and skips it. frugal reads and reports this state; it does not own it. Verify in the spike that 9Router applies it for free providers.
Switch back. 9Router returns to the better model when a cooldown ends. Provider-side prompt caches are lost at each switch, so switching at a new session or after compaction is preferred. frugal surfaces the current model in status but does not drive switching.
Quota reads. 9Router tracks quota and exposes it through its usage API (for example /api/usage/stats, /api/usage/request-details and per-connection quota). frugal reads it for status; providers without a quota API rely on error responses.
Visibility. frugal status shows the tier, the configured combos, the last model served and quota where available. Live per-model cooldowns are shown by 9Router; frank honesty in the UI is preferred to guessing.
Token savers and caching
9Router's RTK token saver compresses large tool outputs (git diff, grep, ls) before they reach the model and reportedly saves 20 to 40% of input tokens. Keep it on by default, with a per-request bypass.
Caveman Mode and similar prompt injections change the model's behavior and stay off.
Prompt caching happens at the provider. It is unconfirmed that 9Router preserves cache markers when translating formats, and compression may change the prompt prefix. Test this on a paid plan before relying on it.
Copilot Student (connected directly, outside the router)
Verified students get Copilot Student at no cost through GitHub Education, with monthly re-checks, an unpublished credit allowance and automatic model choice only. The student verifies at GitHub's education benefits page and connects Copilot inside OpenCode using OpenCode's own GitHub sign-in, not through 9Router. It is therefore outside automatic failover: doctor reports whether it is connected and reminds the student to switch to it by hand when the free providers run out. frugal-bench cannot rank it because the student cannot choose the model.
Local models as a provider
9Router connects a local server as an OpenAI-compatible connection with a base URL. frugal probes the usual ports (Ollama 11434, llama.cpp server 8080, and Kindi 8093 as in its documentation example) and doctor reports any server it finds.
By default local models go last in the combo, so cloud free quotas drain first; the local_mode setting below changes this. A student can prefer a local model for privacy, or lock one to avoid any data leaving the machine.
The context guard handles the smaller windows that local models usually have.
frugal local check detects the GPU and VRAM, finds a running local server (or says how to start one), runs a 10-task subset of the Code suite and a speed test, and prints a comparison against the current top free cloud model: score, speed, limits and privacy. It uses no cloud quota.
Installing a local engine (drivers, Docker, WSL2) is outside the setup flow; frugal links to each engine's own instructions. Kindi is a supported engine: it is AGPL-3.0, its installer is a curl | bash script that needs Docker or WSL2, and frugal never runs it automatically.
Local mode
local_mode value
Behavior
fallback (default)
Local models sit last in the combo; cloud providers are tried first and drain first
first
Local models are primary; cloud providers take over when the local model is too slow, too small for the context, or not running
only
Only local models are used, and no request leaves the student's machine
The setting can be changed at any time, status shows the active mode, and doctor warns if first or only is set but no local server is running. Every local model counts as a normal combo member for the context guard, cooldown and prefer, ban and lock rules.
### 5. Project 1: tool integrations
Every tool connects to the same local endpoint, http://localhost:20128/v1, with the API key frugal generated and the model name free-best. A skills folder is not used, because skills are agent instructions, not provider configuration.
Harness priority. OpenCode is the recommended, default harness: it is fully open, configures cleanly from JSON, supports a custom OpenAI-compatible provider, has native automatic compaction with a configurable buffer, and supports MCP. Pi is supported as a very light-weight alternative via its community 9Router extension. Msty.ai is supported through a one-time guided paste because it has no importable config in its free version. frugal wires all three; the setup wizard defaults to OpenCode and offers the others.
Harness table. Tool, role, method, confidence.
OpenCode (recommended, default)
Write a custom OpenAI-compatible provider entry into OpenCode's JSON config, set free-best as the default model, back up the original file first, and write the compaction block (auto, buffer, keep.tokens) so compaction fires before the smallest combo member's window
Likely works; verify exact config schema, model context limit field and file path per OS
Pi (supported, lightweight)
Install the community 9Router extension, which auto-discovers models and combos and stores its settings in ~/.pi/agent/9router-config.json; write the URL and key there. Confirm whether Pi exposes a compaction setting for frugal to write
Extension confirmed to exist; verify it is maintained and review its code
Msty (free, supported via guided paste)
No known file-based config. Print the three values to paste into Msty's remote OpenAI-compatible provider screen, copy the key to the clipboard, and show a numbered screenshot guide. Msty's own context handling is outside frugal's control
Unverified; test the real Msty UI before writing the guide
Rules for every integration
Back up any config file once before the first change, with a recognizable suffix, and restore it on uninstall.
Make only additive changes: never remove the student's other providers.
After writing, run a one-token test request through the tool's own path if it has a headless mode; otherwise test the endpoint with curl and tell the student to send one message.
Never store the OpenRouter key in a tool config; it lives only in 9Router's data directory.
Where the harness supports it, write its compaction settings and declare the combo's minimum context window; never proxy or summarize requests on frugal's behalf.
Open item. Confirm how each tool handles an upstream failure that 9Router already retried, so the student does not see a duplicate retry loop or a long hang before the fallback model answers.
Directly connected providers. Copilot Student is configured inside OpenCode with OpenCode's own sign-in, not through the router (section 4). Pi can also connect OpenCode Go directly, so a student on the budget tier can use either path; the router path is the default because it adds failover. Two combos are exposed to every tool: free-best and, on the budget tier, budget-best. Students choose between them by model name.
Optional observability (v0.2). The default experience is transparent: frugal configures 9Router and the harness so users do nothing. Two opt-in commands make the behaviour visible for power users. frugal watch polls 9Router's usage API (last-served model, per-request prompt tokens as an approximation of current context size, and per-connection quota) and raises desktop notifications; it is informational and cannot trigger compaction. frugal mcp runs a read-only MCP server exposing router status and quota as a tool or resource inside supported harnesses, OpenCode first; it also cannot trigger compaction and costs a tool call. Neither is required, and neither moves frugal into the request path. Details and caveats are in docs/FALLBACK-AND-CONTEXT.md.
### 6. Project 1: security, privacy, failure handling and acceptance
Security
9Router stores provider keys and tokens locally. Bind it to 127.0.0.1 only, set restrictive file permissions on its data directory, and never print keys in logs or error messages.
Pin one reviewed 9Router version and verify its checksum. There are many forks, and at least one adds proxy-level token rotation across accounts, so the installer must use one named upstream and refuse unknown sources.
Do not use any feature that rotates or pools multiple accounts to bypass limits.
The picks.json fetch uses HTTPS from one configured URL, validates the schema, and ignores anything malformed. It can only reorder, pin or ban models, never add a provider or run code.
Privacy
Tell the student at setup that free endpoints often log prompts and may use them for training, and that they should not paste credentials, personal data or private school material.
Provider age limits and school policy apply. The instructor confirms eligibility before rollout; frugal does not decide it.
Telemetry is off by default. If the instructor wants class-wide health data, it is opt-in and limited to pass/fail from doctor, with no prompts or keys. The local reliability ledger (observations.jsonl) is never uploaded and holds only provider/model ids, status codes, latency and timestamps.
Failure handling
Failure
Behavior
OpenRouter or ranking source unreachable
Keep last good combo, note it in doctor
picks.json unreachable or invalid
Ignore it, use the automatic ranking
Student's key rejected or over its daily cap
Remove OpenRouter entries from use until reset and explain why
All combo members exhausted
Return a clear message naming the reset time instead of hanging
9Router fails to start
doctor shows the port, the log tail and the likely cause
Acceptance criteria
A clean machine with Node installed reaches a working first response from OpenCode in under 10 minutes, with only the default signups (OpenRouter and Groq).
Killing the top model's access (simulated 429) makes the next request succeed from the next combo entry with no manual action.
doctor reports green on a healthy setup and names the exact fix for each of the failures above.
Uninstall restores every modified config byte-for-byte from its backup.
With local_mode set to only, a network capture during a coding session shows no request leaving the student's machine.
### 7. Project 2: frugal-bench, scope and principles
frugal-bench is a scheduled job, run by the instructor on one account, that tests every currently free model, any approved paid-plan model it holds a key for, and the local reference set on a fixed suite and publishes a ranked results.json. Students never run its cloud suites, because free tiers are request-capped and a class-wide run would burn every student's daily quota; the only part students run is the small local subset inside frugal local check, which uses no cloud quota.
Principles
Automatic and repeatable. Every score comes from a pass/fail check or a measured number, never from a judge's opinion. The weights are fixed in a visible config file.
Cheap first. A short screening round runs on every model; the full suite runs only on the top half, to fit free request limits.
Honest about noise. Each task is sampled several times, results carry a confidence range, and models are grouped into tiers instead of being ranked to the decimal.
Measures what agents need. Tool-call reliability and availability count alongside code correctness, because a strong model that is rate-limited or breaks tool calls is useless in an agent.
Resistant to gaming. Part of the task set stays private and is rotated, so providers and models cannot tune to it.
Independent of frugal. The only output is a JSON file with a fixed schema (section 10).
Run environment. One machine or a scheduled CI job, using the instructor's OpenRouter key. A one-time purchase of $10 in credits raises the free cap to 1,000 requests per day and keeps the full run inside one day. The runner must read each model's remaining quota and stop cleanly when it is exhausted, then resume the next day.
Instructor commands. frugal-bench run (screening and full suite), frugal-bench local (the VRAM-class runs), frugal-bench diff (what changed since the last run) and frugal-bench publish (writes results.json and the reference page). Students never need these.
Out of scope for version 1: real multi-step agent sessions against a repository. These are the best predictor of student experience but depend on headless modes in OpenCode and Pi that have not been verified; plan them as version 2.
Coverage of paid tiers. The benchmark's candidate pool is the free models plus the models of any plan on the approved list that the instructor holds a key for. Benchmarking Go models needs one $10 per month subscription on the instructor's account, and it is optional; without it, paid models rank by usage and by instructor picks only. Each entry in results.json carries an access field (free or budget) so frugal can place paid models correctly for each tier. Copilot Student is not benchmarked because its model cannot be chosen.
Local reference tier
frugal-bench also scores a small set of local models, so a student can compare running something on their own GPU against the cloud free tiers. This is a module of frugal-bench, not a third project.
Quality is portable, speed is not. The same model file and quantization give about the same pass rate on any GPU. Quality is measured once on the instructor's machine with the Code and Tools suites; Availability does not apply because local servers have no rate limits. The Long-context suite runs at the context each class can afford.
VRAM classes: 6, 8 and 12 GB. A candidate qualifies for a class when its weights plus the KV cache at the tested context fit with room for runtime buffers; file size alone is not enough. Published guides place a file of about 6 GB on 8 GB cards and about 10 GB on 12 GB cards. The starting budget (an estimate, to be tuned by measurement) is weights up to 75% of VRAM at 8 and 12 GB and 65% at 6 GB, where fixed overhead takes a larger share.
Candidates come from model-hub listings by size budget and licence, plus a list the instructor curates. One published guide names Qwen3.5-9B Q4 for 8 GB and Gemma 4 12B or Devstral Small 2 24B at about 3-bit for 12 GB; these are starting candidates, not recommendations, and no source was found for 6 GB.
Engines. frugal-bench talks to any OpenAI-compatible local endpoint. Ollama, llama.cpp and Kindi are all supported engines; Ollama and llama.cpp are the reference engines for parity checks. Before trusting an engine, run a fixed prompt set with greedy decoding on the same model file under the reference engine and compare outputs; flag any mismatch.
Speed is measured on the instructor's reference GPU, recorded by name, and published as tokens per second labelled with that GPU. The student's own frugal local check gives the number that matters for their card.
Community results. Speed and verification results that Kindi's community publishes may be listed as "community-reported" beside frugal-bench's own measurements, and are never mixed into scores.
Ranking use. frugal never chooses between local and cloud on the student's behalf from scores: it shows the comparison and the student sets local_mode. By default they sit last in the combo and appear in the comparison shown by frugal local check, and a student can still pin one.
Published reference. Besides results.json, the instructor publishes a readable reference document, such as a web page, after each benchmark run. For each VRAM class it lists the model, quantization, file size, score with its confidence interval, and speed with the GPU named, followed by the methodology, the date, and any community-reported numbers kept in a separate, labelled section. frugal links to it from frugal local check and doctor. Its purpose is to let students read the evidence and decide for themselves, not to pick a model for them.
### 8. Project 2: test suites and scoring
The composite score is a weighted sum of four suites. The sizes and weights below are starting values, to be tuned once real results show which suites separate models best.
Suite
What it checks
Size
Metric
Weight
Code
Small programming tasks, each with hidden unit tests that must pass
20 to 30 tasks, 3 samples each
Pass rate
0.40
Tools
Emits valid tool calls in the OpenAI format, picks the right tool, and recovers after an error result
15 scenarios
Valid and correct rate
0.30
Availability
Fraction of requests that succeed without a 429 or 5xx, plus median latency, sampled across the day
10 requests at 3 times of day
Success rate, with a latency penalty
0.20
Long context
Retrieves a fact placed at several depths in a large prompt
5 prompts per model
Retrieval rate
0.10
Score formula
S = 0.40\,C + 0.30\,T + 0.20\,A + 0.10\,L,\qquad C,T,A,L \in [0,1]
Gates. A model with a Tools score below 0.5 or an Availability score below 0.6 is excluded from the combo regardless of its composite, because it will fail agents in practice. Local entries are gated on Tools only, because Availability does not apply to them.
Tiers. Sort by S, estimate a 95% confidence interval per model from the sample counts, and assign tiers (A, B, C) so that models whose intervals overlap share a tier. Within a tier, frugal orders by bench availability first, then by observed reliability, then by usage rank.
Task design rules
Tasks are short and self-contained, with deterministic tests run in a sandbox with no network access.
Roughly 70% of tasks are public in the repository; 30% are private and rotate every quarter.
Include several languages the students use (for example Python and JavaScript), and a few tasks in the style of everyday coursework.
Fix temperature and the system prompt across all models so the comparison is fair.
Validation. Each month, compare the ranking against an external reference, such as a public coding leaderboard, and investigate large disagreements before publishing.
### 9. Project 2: triggers, scheduling and request budget
frugal-bench runs on three schedules, so new models are scored quickly while established models are rechecked for silent changes.
Trigger
Action
Why
Daily list check
Compare the current free model list to the last one. Run the screening round on new models only. Mark vanished models as removed.
Free lineups change with little warning
Weekly
Re-run the Availability suite on every model at three times of day
Free capacity and peak-hour throttling vary
Monthly
Re-run the full suite on the top half of models
Providers can change quantization or backends behind the same model ID
Two-stage run
Screening: 5 code tasks, 3 tool scenarios and 3 availability probes per model. Models below a cutoff stop here and are marked tier C.
Full suite: the remaining tasks, tool scenarios and long-context prompts for the survivors.
Rough request budget (estimate, to be measured)
With about 15 free models, screening needs around 170 requests. The full suite on the top half (about 8 models) at 30 code tasks, 15 tool scenarios, 30 availability probes and 5 long-context prompts, with 3 samples on code, needs roughly 1,100 requests (about 140 per model). A full monthly run therefore fits on the 1,000-per-day tier over one to two days, but not on the unfunded 50-per-day tier.
Operating rules
Respect the 20-requests-per-minute limit with a client-side rate limiter and capped retries; uncontrolled retries can use the daily allowance without producing a single usable result.
Read the account's remaining free-request count from the API before each batch and stop when it is low, then resume the next UTC day.
Publish results only when a run completes; a partial run updates only the models it finished, with their own timestamps.
Keep raw responses for 90 days so that surprising scores can be audited.
Free endpoints may log prompts, so the benchmark must contain no private data, including in the private task set.
### 10. Interface contract: catalog.json, results.json, picks.json and user.json
The hosted files (catalog.json, results.json and picks.json) are static JSON at stable HTTPS URLs (for example GitHub raw files or Pages). Each carries a schema_version; frugal ignores a file whose major version it does not recognize and keeps its last good copy.
catalog.json (written by frugal-bench's catalog job). Provider/model metadata: per provider, id, label, fetched_at, error, and models with id, computed access (free or budget), price per 1M input and output tokens, context, tools, vision and any prompt-training flag. frugal uses it as the default candidate source, filtered to the student's enabled providers and tier, and falls back to a live OpenRouter fetch when it is unavailable. It spends no model tokens to build.
results.json (written by frugal-bench, one entry per model)
{  "schema_version": "1.0",  "generated_at": "2026-11-16T02:00:00Z",  "suite_version": "2026.11",  "models": [    {      "id": "vendor/model-name:free",      "provider": "openrouter",      "tier": "A",      "score": 0.71,      "score_ci95": [0.64, 0.78],      "suites": { "code": 0.68, "tools": 0.82, "availability": 0.9, "long_context": 0.6 },      "median_latency_ms": 2400,      "context_tokens": 262144,      "gates_passed": true,      "last_full_run": "2026-11-01",      "last_seen_free": "2026-11-16",      "status": "active"    }  ]}
picks.json (written by the instructor)
{  "schema_version": "1.0",  "updated_at": "2026-11-16",  "pin": ["vendor/model-a:free", "vendor/model-b:free"],  "prefer": ["vendor/model-c:free"],  "ban": ["vendor/model-d:free"],  "min_context_tokens": 131072,  "notes": "Model D fails tool calls in OpenCode."}
Merge order (frugal): apply the student's bans and the instructor's bans, then the filters; keep only models allowed by the student's tier; place the student's pins first, then the instructor's pins in their listed order; sort the rest by tier, then bench availability, then observed reliability, then usage rank, giving a small bonus to preferred models within their tier. In the budget tier, models with access set to budget from the student's enabled plan sort ahead of free models.
Compatibility rule. New fields may be added without a version change; frugal ignores unknown fields. Removing or renaming a field requires a major version bump and a migration note in the repository.
user.json (local file written by the frugal commands, never uploaded)
{  "schema_version": "1.0",  "tier": "free",  "max_monthly_usd": 40,  "pin": ["vendor/model-a:free"],  "ban": ["vendor/model-d:free"],  "lock": null,  "local_mode": "fallback",  "enabled_providers": ["opencode-free", "openrouter", "groq"]}
New field. Each results.json model entry gains access, with the value free or budget; frugal treats a missing value as free. Adding it needs no version bump under the compatibility rule above.
Local reference entries. results.json gains an optional top-level local array, one entry per model, quantization and VRAM class. Values below are illustrative.
{  "local": [    {      "vram_class_gb": 8,      "model": "vendor/model-name",      "quant": "Q4_K_M",      "file_gb": 6.0,      "context_tested": 16384,      "engine": "llama.cpp",      "score": 0.52,      "score_ci95": [0.43, 0.61],      "suites": { "code": 0.50, "tools": 0.58 },      "speed": { "gpu": "reference GPU name", "tokens_per_second": 28, "source": "measured" },      "last_full_run": "2026-11-16"    }  ]}
The source field is measured for frugal-bench's own runs or community for reported numbers. frugal ignores the local array unless the student runs frugal local check.
### 11. Milestones, risks and open questions
Build frugal first with usage-based ranking, so students benefit early, then add frugal-bench behind the same interface.
Milestones, in order, each gated by its exit check
Spike (verify assumptions). Confirm 9Router's combo API, OpenCode's custom-provider config, the Pi extension and Msty's provider screen on all three operating systems. Exit: a hand-made combo works end to end in each tool.
frugal v0.1. RouterManager (detect, optional local pinned install, start/stop), setup, doctor, usage-ranked combo, OpenCode and Pi wiring. Exit: the acceptance criteria in section 6 pass on a clean machine, and a fresh machine reaches a running router through frugal alone.
Classroom pilot. Five to ten students for two weeks, collecting doctor results and friction notes. Exit: at least 80% reach a working setup unaided.
frugal v0.2. picks.json support, scheduled refresh, Msty guide, uninstall, the observability commands (frugal watch and frugal mcp) as optional.
frugal-bench v0.1. Code and Availability suites, screening round, results.json output. Exit: a full run completes inside the request budget.
frugal-bench v0.2. Tools and Long-context suites, tiers with confidence intervals, monthly validation against an external leaderboard.
Integration. frugal consumes results.json; compare student outcomes against usage-only ranking.
frugal v0.3 (desktop app). An optional Tauri app for low-tech students that removes the Node prerequisite: it bundles a compiled frugal, a Node runtime and 9Router, reuses the RouterManager and the same core, runs the setup wizard and control panel as a GUI, and adds a tray icon and native notifications (watch). The CLI stays canonical and fully supported. Exit: a non-technical student installs, sets up and reaches a working OpenCode session without a terminal.
Version 2 ideas. Headless agent-session benchmarks, more free providers, optional telemetry.
Possible third project: frugal-ui (control panel). A small local UI for the configurator, not a chat app. It shows tier, configured combos, which model last served, quota (where 9Router exposes it), and doctor results, with buttons for refresh, doctor, and prefer/ban/lock. It makes the transparent behaviour visible without moving frugal into the request path. Ship it as a web page served locally by frugal ui (open in the browser) first; the Tauri desktop shell (frugal v0.3) adds the tray icon and native notifications and can bundle 9Router. Reuse the same status data as the CLI. Avoid Electron (heavy) and avoid a Python/Streamlit stack, which would split the codebase.
Not in scope: a Msty clone. A full chat application with RAG, image and speech processing is a different product, and it duplicates Msty, which frugal already supports as the GUI chat client. If such an app is ever wanted, it is a separate project (working name frugal-chat) that talks to 9Router; 9Router already exposes image, TTS, STT and embedding endpoints under /v1/models/{kind}, so it needs no extra provider wiring in frugal. Do not fold chat features into frugal.
Where the added scope lands
Spike (step 1): also verify 9Router's cooldown and context handling, that a 400 context-overflow stays request-scoped, what /v1/models reports as a combo's context window, OpenCode Go's endpoint and key use, Copilot Student inside OpenCode, and compaction in OpenCode and Pi.
v0.2 (step 4): tiers and the cap, prefer, ban and lock, cooldown reporting, harness compaction configuration and the declared combo context window, the Copilot Student guide, and optionally frugal watch and frugal mcp.
Pilot (step 3): include a few students who qualify for Copilot Student, and record whether verification worked.
frugal-bench v0.2 (step 6): optional paid-model coverage with the access field.
Local reference scope
frugal-bench v0.2 (step 6): the local reference tier with the 8 GB and 12 GB classes first, then 6 GB once candidates are tested.
frugal v0.2 (step 4): local provider detection, the local_mode setting, frugal local check and the comparison view.
Pilot (step 3): include students with 6, 8 and 12 GB GPUs and record whether frugal local check ran without help.
Risks
Risk
Likelihood
Mitigation
Free tiers shrink or vanish (this has already happened to several providers)
High
Weekly refresh, provider-agnostic design, local-model fallback guidance
9Router changes its API or database
Medium
Pin version, use the HTTP API only, run a smoke test on each upgrade
Third-party forks or extensions are insecure or abandoned
Medium
Use one reviewed upstream, review the Pi extension, checksum installs
Benchmark does not reflect real agent use
Medium
Gates for tools and availability, external cross-check, agent-session benchmark in version 2
Provider terms or age limits conflict with student use
Medium
Instructor confirms eligibility before rollout
Request caps make agent sessions impractical even with failover
High
Set expectations, add several providers, recommend local models for overflow
Added risks
Paid plan terms, prices or tool restrictions change without notice. Mitigation: the approved list is instructor-maintained and re-checked each term.
Students overspend. Mitigation: the cap, flat-fee plans only, and no per-token keys by default.
A student's Copilot Student eligibility lapses at a monthly re-check. Mitigation: doctor reports the state and the free tier continues to work.
A preferred model that the student pins performs badly or disappears. Mitigation: pins degrade gracefully and status explains what is happening.
A silent model switch changes answer quality or tool-call reliability mid-session. Mitigation: combos are tier-ordered, and students are told that a late-session answer may come from a weaker model.
A harness mis-detects the combo's context window, so compaction fires too late and a request overflows. Mitigation: keep the combo's minimum window high, declare the minimum window where the schema allows, and rely on the harness's one-shot overflow recovery.
Free tiers are small enough that failover overhead consumes the next provider (each hop resends the full prompt). Mitigation: sticky sessions, large-context-first ordering, token saving, and proactive compaction; set expectations that failover stretches quota, it does not create it.
Local reference risks
Small local models frustrate students in long agent loops. Mitigation: the comparison shows scores honestly, and local stays the last resort by default.
Local engine setup (drivers, Docker, WSL2) is hard for beginners. Mitigation: frugal links to engine instructions and does not install engines.
Speed numbers from one reference GPU mislead students with other cards. Mitigation: the student's own frugal local check is the number to trust.
Community-reported results are unevenly verified. Mitigation: they are labelled and kept out of scores.
Unverified assumptions (check in the spike)
9Router's exact combo endpoint and payload format.
OpenCode's config file location and provider schema on each OS.
That Msty has no importable config and accepts a custom OpenAI-compatible endpoint in its free version.
OpenRouter's models API exposes the fields frugal filters on (pricing, modalities, supported parameters, context length).
Whether OpenRouter's rankings data API can be used directly for the free-only usage ranking, or whether the models API is the better source.
That no common CLI already installs a frugal binary, and that frugalrouter is still unregistered on npm and GitHub.
Added unverified assumptions
Whether 9Router applies cooldowns and checks context size when it falls back between free providers.
Whether 9Router classifies a 400 context-overflow as request-scoped (no failover), as its docs suggest.
What 9Router /v1/models reports as a combo's context window: the minimum across members, or a default.
Whether OpenCode's compaction buffer and keep settings take effect when the model is a combo name, and whether its provider model schema accepts an explicit context limit for frugal to write.
Whether 9Router's /api usage endpoints are reachable with the dashboard session frugal sets at setup, which frugal watch and frugal mcp depend on.
OpenCode Go's endpoint address, its exact limits, and whether its key may be used through a proxy; sources disagree on the first two.
Whether Copilot Student works inside OpenCode, and whether Student-plan data is used for training.
Whether OpenCode and Pi compact automatically and cope with a fallback model that has a smaller window.
Whether 9Router's token saver keeps a stable prompt prefix and preserves provider cache markers.
GitHub Education's eligibility rules (school type, age, country), read from GitHub's official pages.
The terms of each candidate cheap plan (GLM, Kimi, Chutes, ClinePass) for use through a generic proxy.
CrowLLM's true free-model set and limits. Its public /v1/models lists ids but not prices, and the :free suffix is not reliable; confirm a machine-readable price source and realistic limits before treating any CrowLLM model as free.
Local reference unverified assumptions
The VRAM budgets (75% of VRAM at 8 and 12 GB, 65% at 6 GB) are estimates and need tuning against real runs.
Kindi's claim that greedy output matches llama.cpp on the same model file, and where its community's verification results are published.
Whether small models at the 6 GB class can handle tool calling well enough to be useful in OpenCode or Pi.
Whether Kindi's 65-task agent benchmark can be reused or adapted under its licence, or only used as a cross-check.
Whether one 9Router combo can mix a local OpenAI-compatible connection with cloud connections in a single fallback chain, which local_mode depends on.
Open questions for the instructor
Where will picks.json and results.json be hosted, and who maintains them?
Are any students minors, and what do school policies require for third-party AI services?
Should the instructor's account buy the $10 credit for benchmark runs?
Decided: local models are in scope as a first-class provider, delivered in frugal v0.2.
Added open questions
Decided: the project is frugal (command frugal, npm package frugalrouter), with frugal-bench for the benchmark.
Decided: frugal is a configurator, not a proxy (decision A). 9Router owns failover; the harness owns compaction. OpenCode is the recommended default harness; Pi (lightweight) and Msty (GUI, guided paste) are supported. frugal watch and frugal mcp are optional v0.2 features.
Decided: no Msty clone. Msty remains the GUI chat client; a later frugal-ui, if built, is a local control panel only, and any chat/RAG/vision app is a separate project (frugal-chat) that talks to 9Router.
Decided: 9Router install is optional and detect-then-offer, never forced. Install the pinned version locally into frugal's own directory (npm --prefix), not globally and never "latest". A RouterManager owns detect/install/start/stop/update/uninstall and backs both the CLI and the future app. The CLI is canonical; a Tauri desktop app in v0.3 bundles a Node runtime and 9Router so a low-tech student needs no terminal and no separate Node install.
Should the default cap be lower than the $40 ceiling, for example $20?
Who pays for the budget tier: students, a sponsor or the school?
Should the instructor hold a Go key so that frugal-bench can rank paid models?
Local reference open questions
Which GPU will the instructor use as the reference card for speed measurements?
Decided: Kindi is a supported engine, alongside Ollama and llama.cpp.
Where does the Kindi community publish results that frugal-bench can link to?
Should frugal local check be offered to every student at setup, or only when a GPU is detected?
