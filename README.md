# Wojak Investor Sim – Development Overview

This README is a single, detailed snapshot of how the sim works today, how the code is organized, and where the design is headed. 

---

## 1. Code Structure
### Core Files
- **`src/sim/`** – Simulation primitives (`simShared.js`), public-company models (`publicCompanies.js`), venture strategies (`ventureStrategies.js`), the venture engine (`ventureEngineCore.js`), and the `Simulation` bootstrap (`simEngine.js`). These files never touch the DOM.
- **`src/ui/`** – Browser-facing modules: `main.js` (portfolio/banking/loop), `vc.js` (venture panel), `pipelineUi.js`, `dashboardRenderers.js`, and `wojakManager.js`.
- **`src/presets/presets.js`** – Procedural company/venture generators that seed the game at boot.
- **`styles/style.css` / `styles/vc.css`** – Presentation for the dashboard and venture console.
- **`data/legacy-companies/*.json`** – Legacy public & private company configs (used as fallbacks/reference only). Preset generators seed the active rosters at runtime.

### Supporting Assets
- `data/presets/*.json` – Data-driven preset definitions (`hardtech.json`, `megacorp.json`, `hypergrowth.json`) consumed by the preset generators.
- `data/legacy-companies/*.json` – Archived company lists (`companies.json`, `venture_companies.json`) kept for reference/testing only.
- `data/*backup*.json` – Prior snapshots of company lists in case you need to roll back presets.
- `wojaks/*` – Wojak avatars / icons.

**Quick loader smoke test (Node):**
```bash
node -e "require('./src/sim/simShared.js');require('./src/sim/ventureStrategies.js');require('./src/sim/publicCompanies.js');require('./src/sim/ventureEngineCore.js');require('./src/sim/simEngine.js')"
```

**Dev smoke scripts (Node):**
```bash
npm run smoke    # Long-run sim + VC sanity checks (fails on NaNs)
npm run lint     # Syntax-only guard for core entry points
npm run mp:connectivity # Multiplayer liveness: spins up a server, multiple sessions/players, and waits for ticks
```

---

## 2. Simulation Mechanics
### Clock & Macro
- The sim advances in 14‑day ticks. Each tick updates:
  1. Sector macro indices (geometric Brownian motion with sector-specific mu/sigma).
  2. Every public company’s fundamentals (revenue, costs, cash, dividend accrual).
  3. Every private company’s fundraise timer and pipeline progress.
- Both public and private charts log a point each tick, so the right edge always represents “today.”

### Public Companies
- **Revenue:** `baseRevenue × sectorMacro × microPerformance × revMult + pipelineRevenue – flatRev`.
- **Margins & Costs:** margin curve (either preset or sector default) sets gross margin; fixed opex + variable opex + R&D burn (stage costs + rdBaseRatio * pipeline EV). Interest applies to outstanding debt.
- **Cash & Debt:** net income adds to cash each tick. Cash shortfalls automatically draw debt; surplus cash above a small reserve pays debt down.
- **Dividends:** once the last 3 full years show positive profit **and** debt == 0, the company schedules a dividend equal to 11% of cash. That dividend is recorded in the annual history but paid out **quarterly** (4 equal installments over the next year). Each payout emits an event that the UI consumes; if DRIP is enabled the payout auto-buys fractional shares, otherwise it hits the player’s cash.
- **Reinvestment:** Even post-IPO, companies can roll new “products” (pipelines) once the catalog exists. The infrastructure is ready to attach more pipelines later.

-### Hypergrowth Startups (private archetype)
- **Lifecycle:** ARR growth targets start between 80% and 250% YoY with margins as low as –30% to –200%. Growth decays toward a floor (8–35%) and margins trend toward +8–28% over roughly 7–10 years.
- **Hypergrowth Window:** `hypergrowth_window_years` (2–4 years in the current preset) governs the intense post-gate burst inside the VC roadmap—the period when revenue multiplies rapidly after clearing the gate. After that window, the long-run decay continues until the company reaches “mature” behavior.
- **Inflection Risk:** Each year there’s roughly a 10% chance of a demand collapse event that forces growth negative (–25% to –40%) and keeps margins under pressure until the company stabilizes.
- **IPO:** When these firms IPO, the `VentureCompany` simply flips to public mode, retaining its ARR/margin state, so the decay curve continues seamlessly on the public side.
- **Archetype:** “Web hypergrowth” is just one flavor; roughly half of all startups in the game will fall into a hypergrowth preset (SaaS, consumer apps, next-gen commerce, etc.). The preset system simply swaps in different curve parameters per era, but the shared behavior remains: fast ARR ramps, sticky burn, demand inflection events, and eventual margin convergence.

### Binary / Deep-Tech Startups
- **Lifecycle:** Long, capital-intensive R&D phases (multiple multi-year stages) with almost no revenue until the product works. Each stage is effectively binary: success unlocks enormous value realization; failure wipes out the investment.
- **Target Use Cases:** Fusion power, advanced space propulsion, brain–machine interfaces, nanobot manufacturing, etc. These companies will still use the shared private/public engine but with very different presets (low success odds, long durations, huge value realization).
- **Roadmap:** Implemented as a hard-tech/binary archetype; schema/preset work continues, but the lifecycle is live.

### Private / Venture Companies
- **Stages:** Seed → A → … → F → Pre-IPO, each with deterministic PS/margin presets and raise fractions. Companies are always “raising”: as soon as one round closes, the next opens.
- **Success Odds:** Stage success probability is scaled by a health score (growth, margin, runway). If outside investors bail, the player can still keep the round alive by committing. Rounds simply do not resolve if the company is in particularly bad shape (failure/collapse logic is currently disabled).
- **IPO:** Once the configured target stage clears, the company emits a `venture_ipo` event. Instead of instantiating a fresh public company, we now flip the same object into `phase='public'`, copy over the macro env, and keep its history/cash/margin state intact.

---

## Venture Capital (Deep Dive)
### Unlock & Access
- VC tab unlocks at **$1,000,000 net worth**; button is disabled with a tooltip until then. Once unlocked, the VC grid lists private companies from the venture roster.

### Company States & Rounds
- **Archetypes:** Hypergrowth (revenue-driven) and Hard-Tech/Binary (pipeline-driven). The archetype persists through IPO.
- **Round lifecycle:** Seed → A → … → Pre-IPO with pre-money, raise amount, dilution %, success probability, and a duration (months → days). After a successful close the next round opens; failed rounds refund commitments and clear pending equity.
- **Health & resolution:** Hypergrowth rounds weigh revenue growth, margin vs. stage expectations, and runway. Hard-tech rounds weigh pipeline progress and runway. Rounds resolve when timers elapse or when the pipeline signals readiness (hard-tech).
- **Statuses:** Raising (default), IPO Ready (target stage reached), IPO (exited to public sim), Failed (equity/commitments wiped).
- **IPO handling:** On `venture_ipo`, the same object is promoted to the public sim; player venture equity converts to public shares; pending commitments are cleared.

### Player Actions
- **Lead Round:** Commit the full raise for the posted dilution (equityOffered). Server validates cash and caps allocation.
- **Invest Fraction:** Buy preset slices (full, 1/10, 1/100, 1/1000 of the round) or arbitrary pct via WS; server clamps to remaining allocation and cash.
- **Cash flow:** Commitments immediately reduce cash; on close, commitments become equity in `ventureHoldings`. Failed rounds refund cash and delete commitments. Pending commitments count toward net worth and borrowing caps (client + server).
- **Portfolio display:** VC holdings show stage labels and “in-flight” commitments; pending commitments display as value even before equity is granted.

### UI Surfaces
- VC grid: valuation, stage, your stake badge.
- VC detail: valuation chart, pipeline view, financial table, round timer, dilution label, lead CTA, fraction buttons, and action notes for success/failure.
- Net worth/borrowing: venture equity and commitments feed into net worth and the 5× borrowing cap.

---

## 3. Presets & Rosters
### Current State
- Procedural helpers in `main.js` now append preset companies when the sim loads:
  - **Hard Tech:** sourced from `data/presets/hardtech.json`. Each entry defines founders, IPO windows, and a flagship deep-tech pipeline; the loader randomizes financial curves. Final counts are still fluid as we head toward ~80 total companies through 2050, and current names are placeholders.
  - **Steady Megacorp:** data lives in `data/presets/megacorp.json` (authored founders/IPO windows/sectors/balance knobs). The generator randomizes revenue/margins/multiples; roster sizing and names are placeholders for now.
  - **Hypergrowth Startups:** `data/presets/hypergrowth.json` declares the hypergrowth presets (valuations, decay curves, IPO targets). The generator seeds the venture market before flipping to public mode later; current names are placeholder-only.

### Design Goals
1. **Helper API:** Replace the raw generator functions with something like `createBiotechCompany(config)` / `createMegacorpCompany(config)` so every company entry is simply `preset + overrides`. No random founders; each company is intentionally authored.
2. **Era Rosters:** For each start era, maintain a list of curated configs and only spawn a subset each playthrough (e.g., 1 biotech at game start, another mid‑1990s). Keeps variety without procedural randomness.
3. **Product Catalogs:** Build sector-specific product libraries (starting with ~20 biotech pipelines). Companies draw unique products so no pipeline appears twice in the same game. Over a company’s lifecycle (roughly every decade) new products can unlock; some archetypes (e.g., pure retailers) explicitly opt out and stay product-less.
4. **Config Files:** Move preset selections/rosters into declarative JSON so balancing doesn’t require editing JS.

### Grand Vision
- Each decade introduces different archetype mixes. Examples:
  - **1990–2000:** surge of web/consumer software hypergrowth startups plus a handful of risky biotech IPOs.
  - **2000–2010:** rise of mobile/cloud megacorps, maturing retailers, and perennial biotech entries.
  - **2020–2030:** biotech/gene therapy takes center stage; late-decade includes early space/BMI plays.
  - **2030–2050:** space infrastructure, brain–machine interfaces, nanotech manufacturing, etc., become common.
- The preset system will drive this: each era has a roster of curated company configs that point at the appropriate preset (space startup, BMI, nanobots, etc.), and the sim picks the subset for that playthrough without removing older archetypes entirely.
- Public companies should remain active beyond IPO: every ~10 years (give or take by preset) they can roll a new product pulled from their sector catalog, unless the archetype is explicitly “productless” (e.g., pure retailers where the focus is on margin/growth curves).

---

## Future Company Roster Plan
- **Era-driven slates:** Curate decade-specific slates (1990s web/bio, 2000s mobile/cloud/retail, 2020s gene therapy/space-adjacent, 2030–2050 space/BMI/nanotech). Each run spawns a subset per era to keep variety while staying authored.
- **Preset + metadata only:** Each entry is “preset key + flavor” (name, founders, mission, location, IPO window, optional overrides). No bespoke curve data in JSON; balance stays in presets.
- **Ventures first:** Venture rosters (hypergrowth + hard-tech) seed each era; IPOs promote their live state into the public sim. Late-era public-only names fill gaps (e.g., industrial/space megacorps).
- **Sector catalogs:** Expand product catalogs per sector and enforce uniqueness per run so two companies never share the same pipeline in one playthrough.
- **Sizing goal:** Grow toward ~80 public companies across 1990–2050 plus a rotating bench of private ventures each decade; retire placeholder names as the curated list fills in.

---

## 5. Banking, DRIP, Wojak
- Banking panel lets the player borrow up to 5× net worth at 7% annual interest. Interest accrues automatically and is withdrawn from cash; hitting negative net worth with debt outstanding ends the game.
- DRIP toggle in the header persists via `localStorage`. When enabled, each quarterly dividend event automatically buys fractional shares using `payout / marketCap` units.
- Wojak reacts to your fortunes: become a millionaire/billionaire/trillionaire to unlock new suits. Malding (single-player only) now triggers at a 50% drawdown; severe at 70%. Recovery lines are ATH for mild and –50% for severe, with a 10s/14s minimum and a 14s hard cap. Malding is suppressed in multiplayer and while suited.

---

## 5. Multiplayer Reality Check
Multiplayer stays on hold until the single-player loop, presets, and balance polish are in a good place.

- Planned flow: hit **Play Multiplayer** in the header, either create a party or join one (public or private), invite up to two friends, and race for the highest net worth over the chosen time span. No long-term save/persistence is needed—each session is self-contained.

---

## 6. Wishlist / TODO
1. Preset Helpers & Rosters: Formalize the API, migrate existing companies to `preset + overrides`, and document the schema so new entries are easy to author.
2. Sector Pipelines: Author the biotech product catalog and start populating consumer/industrial equivalents (store formats, logistics projects, etc.). Ensure pipeline selection is unique per run.
3. UI Enhancements: Surface quarterly dividend events/logs so players can see DRIP vs. cash payouts. Show private-company cash/runway directly in the venture view.
4. Testing: Add a headless smoke test (10+ years) to catch NaNs, stage/IPO frequencies, dividend scheduling bugs, etc.
5. Deterministic Seeding: Eventually allow a seed to reproduce the same preset/pipeline selection for long-form testing.
6. Fundraise Balance & VC UI: Reduce how often companies raise below prior valuations, lengthen round timelines when appropriate, and streamline the venture investing UI so committing to rounds feels straightforward.
7. Quarterly YoY Charts: Prototype an optional quarterly YoY revenue/profit chart so players can swap between tabular data and a visual trend.
8. Preset-First Companies (Long Term): Continue migrating every legacy entry onto curated preset definitions so balancing stays centralized.
9. Era Depth & Product Catalogs (Long Term): Author many more companies/startups across 1990‑2050 plus deeper product libraries so each era feels distinct and varied.
10. Macro Event Polish: Polish & test & improve macroevents
11. Malding Wojak Polish: Track a few outstanding edge cases (post-milestone overrides, deep drawdowns) and tighten the revert logic so avatars always swap back at the right time; fixes are noted but still pending.
12. Currently bankrupt companies stay in your portfolio forever -- should fix.
13. rn when u hit a $0 nw without leverage u dont go bankrupt -- should fix.
14. Multiplayer name collisions: joining with a duplicate display name sometimes leaves the client in a bad state; enforce/handle unique names cleanly without requiring a refresh.
15. If the backend is cold-starting, keep retrying party creation/join every few seconds instead of failing once.
16. Multiplayer bankruptcy.
17. Verify multiplayer Wojak-only confetti/suit unlocks behave correctly (no effects for other avatars).
18. Decide if characters should have distinct borrowing knobs (e.g., Wojak default, Grug 6% @ 3x, Zoomer 5% @ 2x, Bloomer 4% @ 1.5x).
19. Support more than 4 players (up to 8) by skipping character choice beyond slots, assigning random colors, no top avatar, and showing a neutral/blank image in tooltips.
20. Consider adding monthly incomes in multiplayer (e.g., ~200-400/month scaled by character).
21. Likely shift start year to 1985 and lower VC unlock requirement to $1M net worth.
22. Offer smaller VC ticket sizes/packages so players can invest without needing huge cash stacks.
23. Consider replacing the M/B/T buttons with temporary debug commands during development.
24. Remove the time slider in multiplayer.
25. Add a pause/start button to singleplayer.
26. Maybe add a time slider on company pages.
27. Add “Founder” and “Founding location” fields to the top-right of company pages.
28. Clean up the VC company page UI (currently cluttered).
29. Add a short mission blurb to each company page.
30. Maybe make the UI mobile-friendly.
31. Maybe add a log-curve toggle/button in multiplayer.
32. Align the multiplayer button with the net worth display/chart corner and restyle it (e.g., a small multiplayer icon).
33. Fix companies going bankrupt instantly on game start
34. Adjust the time slider to a 0.25x–3x range
35. Maybe add a pause/start button beside the time slider
36. Fix broken PostHog analytics events
37. All js alerts should be 2nd thought about -- because they are pretty annoying

---

## 7. Recent Changes & Near-Term Plan
### Recent Refactors
- **Module split & folders:** `src/sim/` and `src/ui/` now house simulation logic and DOM code separately; CSS sits under `styles/`. `index.html`/README reflect the new structure.
- **Preset data:** Hard Tech, megacorp, and hypergrowth startups read from `data/presets/*.json`, so balancing lives in data instead of inline JS. Legacy `companies.json` files sit under `data/legacy-companies/` for reference only.
- **VC experience:** Portfolio cards show live round labels, VC commitments count toward net worth immediately, and in-flight deals are labeled in the header instead of a footer line; Wojak/portfolio modules stay in sync when stages advance.
- **Promises everywhere:** Preset generators and company loading paths are async so they can fetch JSON first, keeping future preset migrations straightforward.
- **Macro events:** `data/macroEvents.json` feeds a `MacroEventManager` that applies revenue shocks (pandemics, rate spikes, Bogdanov manipulation) and surfaces active events in the dashboard.

---

## 8. Preset-Driven Company Data Plan
To keep balancing centralized while still authoring memorable companies, we’ll migrate away from giant JSON blobs full of bespoke financial knobs and toward a preset + metadata model.

1. **Archive Legacy JSON (done):** The old `companies.json` / `venture_companies.json` files now live under `data/legacy-companies/` for reference only. Future work is focused on authored preset data.
2. **Fresh Metadata Files:** Stand up new, minimal JSON files—one per era or archetype—that only describe presentation details:
   - `id`, `displayName`, `sector`, founder blurbs, IPO/founding year, flavor text, etc.
   - `presetKey` or similar pointer so the loader knows which preset to apply.
   - Optional overrides (e.g., “starts with product catalog X,” “starts in era 1998”) but no raw growth curves or hard-coded odds.
3. **Preset Loader:** Add a small module (`presetLoader.js` or similar) that:
   - Parses the metadata JSON.
   - Validates the schema (missing preset, bad era tags, etc.) before boot.
   - Calls helper factories such as `createBiotechCompany(metadata)` which inject the preset defaults (growth curves, IPO rules, product probabilities).
4. **Sim Integration:** `main.js` (or a new bootstrap file) seeds companies purely by referencing presets plus their metadata. Balance tweaks happen inside the preset definitions, so adjusting hypergrowth decay or IPO odds touches one place.
5. **Player Variety:** Because the metadata no longer encodes exact EV, we can rotate rosters per playthrough (e.g., random subset of curated companies per decade) without revealing which ones are secretly tuned better. Presets can still introduce variability (e.g., slight randomization within bounds) while keeping authored flavor intact.
6. **Tooling Ready:** With clean JSON, future tools (simple editors, diff-friendly reviews, even AI-assisted authoring) can add companies without touching code. Testing scripts can also validate that every metadata entry resolves to a real preset and product catalog.

This transition keeps the flavor of hand-authored companies while ensuring game balance lives in one preset system rather than scattered across dozens of bespoke JSON entries.

---

## 9. Venture Archetypes & Pipeline Mechanics
We now treat venture companies as explicit archetypes instead of one-size-fits-all hypergrowth clones.

### Dual Archetypes
- **Hypergrowth (default):** Keeps the existing ARR decay curve, stage-based round health, and valuation logic tied to `VC_STAGE_CONFIG`.
- **Hard-Tech / Binary:** New lifecycle driven by product pipelines, with deep negative margins pre-commercialization and binary stage success. `generateBinaryHardTechCompanies()` injects a dedicated hard-tech pipeline template, base business, finance, costs, and metadata (`archetype: 'hardtech'`).

### Engine Changes
1. **Archetype Flag:** `VentureCompany` stores `archetype` and copies preset `pipeline/events` through `buildPublicConfigFromVenture()` and `VentureSimulation` so private companies keep their authored DNA.
2. **Hard-Tech Financials:**
   - Pre-gate revenue + valuation loops now live on the strategy classes, so hypergrowth keeps its PS/margin glide while hard-tech leans entirely on pipeline EV and stage progress before commercialization.
   - `computeFairValue` uses unlocked/expected pipeline value for hard-tech firms in the private phase.
   - `calculateRoundHealth` scores hard-tech rounds based on pipeline progress + runway rather than revenue growth.
3. **Stats Helper:** `getHardTechPipelineStats()` summarizes total stages, completed stages, active stage costs, and commercialized value, feeding the hard-tech revenue/valuation logic.
4. **Round Dynamics:** All funding rounds still share the same timelines today, but because archetypes are explicit we can add hard-tech-specific stage configs later (longer duration, different valuation clamps) without impacting hypergrowth.

### VC Pipeline Visibility
- `VentureCompany.getDetail()` now emits a lightweight `products` array so the UI can render pipeline state.
- The VC detail view includes the existing `getPipelineHTML()` panel, refreshed on every venture tick, so hypergrowth and hard-tech players can watch stages advance in real time.

### Future Work
1. **Preset Separation:** Continue authoring hypergrowth and hard-tech presets independently so neither shares hidden parameters.
2. **Round Cadence per Archetype:** Introduce optional per-archetype stage tables (e.g., slower raises for hard-tech) to better match real-world capital cycles.
3. **UI Improvements:** Surface private cash/runway alongside the pipeline, plus event logs for stage successes/failures.
4. **Public Continuity:** When a hard-tech firm IPOs, its pipeline and revenue curve already match the private state (no reset to hypergrowth defaults).

This structure keeps the venture and public engines on the same simulation clock while letting each archetype evolve with its own financial model, pipeline, and presentation.

---

## 10. VC Engine Refactor (Status)
Hypergrowth and hard-tech startups now run through archetype-specific strategies rather than a single Seed→F pipeline.

### Completed Work
1. **Round schema:** Venture configs can declare `rounds` arrays (strings or objects); legacy JSON still defaults to Seed→Pre-IPO, so nothing breaks.
2. **Strategies:** `VentureCompany` delegates round timing, health scoring, fair-value math, and pre-gate revenue to `HypergrowthStrategy` or `HardTechStrategy`. Hard-tech rounds only resolve when the active pipeline stage succeeds, and valuations derive from unlocked/expected pipeline value.
3. **Preset integration:** Procedural presets now ship their round metadata, and hard-tech IPOs carry their pipeline state forward instead of resetting to hypergrowth defaults.
4. **UI signal:** The VC detail view surfaces the pipeline stage being financed whenever the strategy reports it.

### Future Enhancements
- **Sub-presets / eras:** Layer metadata like `subpreset: "web_2000s"` so different cohorts can tweak odds/durations without more code.
- **Tooling / JSON migration:** Move curated venture rosters into declarative JSON plus validation scripts to ensure each `rounds` entry references a known stage.
- **Strategy extensions:** Add per-archetype cadence tables, richer stage events, and new archetypes (deep tech, fusion, etc.) on top of the same interface.

This refactor keeps hypergrowth and hard-tech equal citizens: both read their round order from data, both run on the same tick loop, but each archetype can evolve its financing lifecycle independently. It also sets the stage for richer presets (era-specific rosters, custom odds) without touching the engine again.

## 11. Company Population Roadmap
We need a much deeper roster so every run feels fresh. Rough plan by era:

### 1990‑2000
- ~3 Walmart-style retailers, 1 biotech-ish hard-tech, 1 manufacturing (WMT-like), 1 defense contractor, 2 banks (higher growth/risk), 1 small-cap software shop.
- Sprinkle ~3 additional IPOs from those sectors and keep the product catalog simple (one flagship pipeline per company).

### 2000‑2010
- Add 3 venture hypergrowth startups (ViaWave-style web plays) that unlock over the decade—ideally with a pulsing VC button indicator when a new deal appears.
- Introduce another round of IPOs across retail, biotech, manufacturing, plus a few tech-heavy listings (rockets, biotech, SaaS).

### 2010‑2020
- Lean into hard tech + consumer platforms: food delivery, ride-hailing, AI/robotics, space launch, etc. Mix public listings and venture deals so the VC panel stays busy.

### 2020‑2030
- Lots of AI/superintelligence/robotics/autonomy bets. Some should be binary hard-tech, others high-growth platforms. Macro backdrop should trend bullish so late-game runs feel explosive.

### 2030‑2050
- Big swings: genetic engineering, life extension, asteroid mining, off-world logistics. Blend public and private opportunities so the player can keep deploying capital.

### Variety Rule
Only ~⅓ of the available companies should spawn per playthrough (randomized per era) so no two runs share the exact roster. The remaining entries stay dormant until the next game.

---

## 12. Macro Events
Macro turbulence is now data-driven via `data/macroEvents.json`. Each definition includes:

- `start_year_range` + `chance`: rolled once per run so events only occur during their authored window.
- `impact_days_range` / `recovery_days_range`: define the drawdown and rebound windows (revenue slides down during impact, glides back during recovery).
- `global_multiplier_range` plus optional `sector_impacts`: multipliers applied before costs/margins, so pandemics hammer retail/travel but boost biotech.
- `valuation_compression_range`: optional multiple compression that undoes over the recovery phase.
- Optional mu/volatility deltas (`effects`) for extra flavor.

`MacroEventManager` schedules each event once, applies the revenue/valuation curves through impact/recovery, and exposes active crises in the UI (orange pills under the header). Public-company revenue and fair value automatically reference these multipliers, so profits and prices visibly react to pandemics, rate shocks, etc.

**Dev tip:** run `triggerMacroEvent('pandemic_global')` (or any event ID) from the browser console to force an event mid-run while testing.

---

## 13. Quarterly Accounting Shift
- **Revenue & profit now quarterly-first:** Every public company tracks a rolling `quarterHistory`; annual rows in the financial table are derived from summed quarters (or fall back to the old accumulators if the year isn’t fully populated yet).
- **TTM / YoY charts:** The YoY builder uses TTM (or partial TTM) from `quarterHistory`, so the optional quarterly chart can swap between annual table and quarterly trend without mixing units.
- **Dividends remain quarterly:** Dividend eligibility still evaluates the last three full years of profit and zero debt, but payouts are scheduled as four quarterly installments with DRIP support unchanged.
- **UI refresh hooks:** The game loop marks `newQuarterlyData`/`newAnnualData` so the financial panel and pipeline widgets refresh when a quarter closes; no behavior change needed for legacy companies.

---

## 14. Multiplayer Implementation (current)
- **Server shape:** `server/server.js` runs Fastify + WebSocket with in-memory sessions (no persistence/auth). Defaults: 50-connection cap, 2-minute idle timeout (commands or clients), 500ms ticks stepping 14 days, hard stop at year 2050.
- **Seeding & sim:** Each session builds `Simulation` + `VentureSimulation` with seeded RNG. Preset generators fill public/venture rosters; sessions are created via `GET /session/:id`. WebSocket endpoint `/ws?session=<id>&player=<name>&role=host|guest` handles joins.
- **Session flow:** First host sets `hostId`; `start_game` begins ticks. Joining after start is rejected. Names are canonicalized (trim/30 chars); duplicate live names are blocked, reconnect allowed if no live socket with that name. Idle guards warn/close inactive sessions.
- **Tick payload:** Each tick broadcasts a compact snapshot (lastTick, minimal company snapshots, venture snapshot + events, dividend events, serialized players) plus a seq id; last 50 ticks are buffered for resync.
- **Player model:** Per-player cash, debt, holdings, ventureHoldings, ventureCommitments, ventureCashInvested, DRIP flag, character, net worth (cash + public equity + venture equity + commitments – debt); bankruptcy flagged when net worth < 0 with debt.
- **Commands (validated server-side):** `start_game`, `resync`, `ping`, `buy`/`sell`, `borrow`/`repay` (5× net-worth cap), `set_drip`, `set_character` (wojak/grug/zoomer/bloomer), `vc_lead`, `vc_invest` (pct), `liquidate_assets`. Cash/round status/limits enforced.
- **Venture handling:** Venture events update per-player ventureHoldings/commitments; round closes burn commitments; IPOs adopt the venture into the public sim and convert stakes to public holdings.
- **Current gaps:** In-memory only (no persistence or matchmaking), fixed tick speed, no passcodes or lobby UI beyond the basic host/guest flow; idle cleanup will end empty sessions.
