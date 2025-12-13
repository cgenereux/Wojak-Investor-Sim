  About

  - Wojak Investor Sim is a browser-based stock market and venture investing game where you play as Wojak (or friends), building a portfolio from 1985–2050.
  - The live version runs at https://wojakinvestorsim.com using this codebase (vanilla JS frontend + Node/Fastify WebSocket backend).
  - The sim combines a public market (macro events, sectors, pipelines, dividends, bankruptcies) with a private VC layer (growth startups + hard tech ventures that IPO into the same world).
  - Supports both singleplayer and multiplayer party sessions with a server-authoritative timeline and shared leaderboard.

  Quick Start

  - Requirements: Node 18+ for the backend/tests, and any static HTTP file server to serve this folder over http:// (the frontend uses fetch for JSON, so file:// will not work reliably).
  - Singleplayer (local): from the repo root, run a static server such as `npx serve .` or `python -m http.server`, then open the served `index.html` in your browser to play with a fully local simulation.
  - Multiplayer (local): in addition to the static server, run `npm install` once and then `npm start` to launch the Fastify/WebSocket backend on `ws://localhost:4000`; open the frontend and use the Multiplayer button to create/join a party (the client auto-targets localhost when running there).

  Architecture

  - Frontend is vanilla JS/HTML/CSS with Chart.js for charts and js-confetti for flair (index.html, src/main.js plus src/ui/*).
  - Backend is Fastify + WebSocket (server/server.js); it instantiates the same sim modules as the client (src/sim/*) and pushes ticks to connected clients.
  - Game timeline runs from 1985 to 2050 with 14-day ticks; server ticks every 500ms in multiplayer and stops on idle or year 2050.
  - Data/presets live under data/ and are generated at runtime via src/presets/presets.js (hard tech, megacorp, product rotators, hypergrowth ventures, binary hard tech ventures) plus macro events (data/
    macroEvents.json).

  Player & Economy

  - Each player starts with $3,000 cash, and a character (wojak/grug/zoomer/bloomer); state includes cash, debt, holdings, venture equity, commitments, invested cash, drip flag (server/
    server.js:createPlayer, src/main.js).
  - Net worth = cash + public equity + venture equity + pending commitments − debt; bankruptcy triggers when net worth < 0 and debt > 0 (single-player shows restart popup; multiplayer liquidates your
    positions).
  - Borrowing: up to 4× net worth cap at 8.5% APR; borrow/repay commands and UI in the banking modal (server/server.js, src/main.js).
  - Dividends accrue quarterly; optional DRIP reinvests payouts into more shares (server/server.js:distributeDividends, src/main.js).
  - Cosmetic states: suits unlock at millionaire/billionaire/trillionaire, “malding” Wojak on >50% drawdowns, happy Wojak on a 5x returns within 3.5 years, favicon/avatar swaps (src/main.js, src/ui/wojakManager.js).

  Public Market Simulation (single-player local and server-side)

  - Companies model revenue growth, margins, valuation multiples, debt/cash, dividends, and bankruptcy (src/sim/publicCompanies.js).
  - Margin and multiple curves mature over time; structural sentiment bias and cyclical micro factors add noise; sector-specific micro stats shape volatility.
  - Product pipelines use staged R&D with costs, success/failure, and commercialisation flags; unlocked value and option value feed into valuation.
  - Product manager can spawn/retire products over time (replacement/gap windows); scheduled company events and macro environment multipliers impact revenue.
  - Dividends start after three profitable years with no debt and pay in installments; bankrupt firms drop to the bottom of lists and stop trading.

  Sectors & Subsectors

  - Canonical sectors today are: Technology, BioTech, Energy, Finance, Retail, Industrial, Materials, and Healthcare; older labels like Travel and Defense are normalised into Industrial, and Real Estate is treated as Finance.
  - Airlines/transport/travel-themed companies are mapped into Industrial (sharing the “industrial/travel” color family), so there is no separate Travel sector in the macro layer.
  - Technology companies can optionally carry a subsector label used for visuals and sorting only: Web Technology, Hardware Technology, Material Technology, Aerospace Technology, and Space Technology (all still roll up to the Technology sector for macro and fundamentals).

  Macro Events

  - Pandemic, rate shock, recession scenarios affect revenue multipliers, valuation compression, drift, and volatility (sector-specific impacts) (data/macroEvents.json, src/sim/
    macroEvents.js).
  - Active macro events show as pills above the header (src/main.js:updateMacroEventsDisplay).

  Venture/VC Layer

  - Separate private-market sim (src/sim/ventureEngineCore.js) with stage config Seed→Pre-IPO, runway/cash-burn, and fair-value calculations.
  - Strategies: Hypergrowth (revenue-driven) vs HardTech (pipeline-driven with gate stage, binary success option); hard tech uses product stages to unlock revenue and can collapse on repeated failures (src/
    sim/ventureStrategies.js).
  - Rounds have pre-money, raise amount, dilution, success probability, and timers; players can lead (commit full raise) or invest fractions. Health scores consider growth, margins, runway, or pipeline
    progress.
  - Events: round closed (equity assigned, commitments consumed), round failed (refund), venture failed (equity wiped), IPO (promotes to public sim; converts venture equity to public units; clears
    commitments) (server/server.js:handleVentureEventsSession).
  - Venture value and pending commitments contribute to net worth and borrowing caps.

  UI & UX

  - Playable multiplayer avatars: Four selectable characters (Wojak, Grug, Zoomer, Bloomer) chosen via the character overlay in the multiplayer modal; avatar selection syncs to the server so others see your character.
    Party avatars stack in the header; the current lead avatar name sits beside your Wojak art.
  - Mood/appearance states: Wojak malds on >50% drawdowns in single-player; malding auto-clears after recovery or time cap. Cosmetic suits unlock as your net worth climbs: suit Wojak (millionaire), red suit
    (billionaire), glowing suit (trillionaire). Malding is disabled in multiplayer to avoid noisy swaps.
  - Celebrations: Confetti triggers at millionaire/billionaire/trillionaire milestones; DRIP toggle and banking actions give toasts for feedback. Timeline-end and bankruptcy popups swap in the current avatar
    for flavor.
  - Charts & tooltips: Net-worth chart overlays all players in multiplayer; tooltip shows every player at the hovered date with their avatar (or color chip) and net worth. Company and VC charts have custom
    HTML tooltips (date + market cap/valuation) for readability.
  - HUD & layout: Header shows net worth, current date, macro-event pills, and multiplayer status/session ID. Market grid supports sort/filter; bankrupt firms are visually demoted. Detail panels include
    pipeline visualization, financial tables with dividend yield/P-S/P-E, buy/sell (with max buttons), and mission/founder/location badges. Portfolio lists both public and private stakes/commitments with
    stage/context labels. VC view has round timers/dilution, lead CTA, and preset buy fractions; VC and main views have back buttons to swap contexts. Multiplayer lobby shows player chips at the top and validates unique names; host/guest cues are reflected in the UI.
  - Sector visuals: Public and VC market grids use a soft gradient color system by sector, with Technology and its subsectors arranged in a pastel blue–purple spectrum (Space → Aerospace → Materials → Hardware → Web → core Technology) so sorting by sector reads as a left-to-right color flow.

  Multiplayer Flow

  - Party modal lets you set a display name, pick a character, create a session code, copy it, or join by code; host vs guest role tracked in URLs and WS params (src/ui/multiplayer.js, src/main.js).
  - Host must send start_game; guests blocked once started. Server enforces unique names per session, max connections, and rejects late joins.
  - Server is authoritative: ticks, trades, borrowing, venture actions run server-side; clients receive tick snapshots + resync buffers (50 cached ticks) to recover.
  - Idle guards: 2-minute inactivity warning/kill, and session cleanup after clients leave (server/server.js).

  Server Commands & Tick Payloads

  - Commands: start_game (host), buy/sell, borrow/repay, liquidate_assets, set_drip, set_character, vc_lead/vc_invest, debug_set_cash, kill_session, resync, ping (server/server.js).
  - Tick broadcast includes tick seq, lastTick, companies (light snapshots), venture snapshot and events, dividend events, and serialized players (cash, debt, holdings, venture stakes/commitments, net worth,
    bankrupt flag).

  Content/Preset Generation

  - Public presets: hard tech (biotech-style pipelines), steady corporations (tech, finance, retail, etc), each with sector defaults and IPO timelines (data/presets/*.json, src/presets/presets.js).
  - Venture presets: hypergrowth and binary hard-tech ventures.

  Analytics & Debug

  - PostHog instrumentation for match start/end and decade net-worth checkpoints; frontend includes the PostHog SDK (index.html, src/main.js). PostHog is configured with `person_profiles: 'always'`, so anonymous visitors also get a person profile (it “IDs” everyone).
  - End-of-match “Give Feedback” sends to email via `POST /api/feedback` on the backend; configure SMTP env vars (`FEEDBACK_SMTP_HOST`, `FEEDBACK_SMTP_PORT`, `FEEDBACK_SMTP_SECURE`, `FEEDBACK_SMTP_USER`, `FEEDBACK_SMTP_PASS`, optional `FEEDBACK_MAIL_TO`/`FEEDBACK_MAIL_FROM`).
  - Debug helpers: manual macro trigger `window.triggerMacroEvent(id)` (e.g., `'global_recession'`, `'pandemic_global'`), set cash to M/B/T buttons, and server-side `debug_set_cash` command.
  - Local-only debug mode: add `?debug=1` when running on localhost singleplayer to unlock extra speed steps and show debug controls; this is intentionally disabled in multiplayer/server-authoritative mode.

  Venture Capital (what’s in-game)

  - Unlock: VC tab turns on at $1M net worth; grid lists private startups from the current venture roster.
  - Archetypes: Hypergrowth (revenue-driven) and Hard-Tech/Binary (pipeline-driven); archetype sticks through IPO.
  - Round flow: Seed → A → … → Pre-IPO. Each round has pre-money, raise, dilution %, success odds, and a timer. After a close, the next round opens; failed rounds refund commitments.
  - Health gates: Hypergrowth scores growth/margin/runway; hard-tech scores pipeline progress + runway. Rounds resolve on timer or pipeline readiness (hard-tech).
  - Statuses: Raising, IPO Ready (target stage reached), IPO (promoted into public sim), Failed (equity/commitments wiped).
  - IPO handling: Same object is promoted to public; player venture equity converts to public shares; commitments cleared.
  - Player actions: Lead (full raise for posted dilution) or fractional invest (full/1⁄10/1⁄100/1⁄1000 or arbitrary pct). Server clamps to allocation and cash. Commitments hit cash immediately; on close they
    become equity; failed rounds refund. Commitments and venture equity count toward net worth and borrowing caps.
  - UI notes: VC grid shows valuation/stage/stake; detail shows valuation chart, pipeline view, financial table, timer, dilution label, lead CTA, fraction buttons; portfolio shows stage labels and “in-flight”
    commitments.

  Hypergrowth Parameters (VC-native)

  - `initial_revenue_usd`: starting annualised revenue at the beginning of the hypergrowth sim.
  - `hypergrowth_window_years`: length (in years) of the intense hypergrowth phase.
  - `hypergrowth_initial_growth_rate`: YoY revenue growth at the start of the hypergrowth window.
  - `hypergrowth_terminal_growth_rate`: YoY revenue growth at the end of the hypergrowth window (pre-public, just before things normalise).
  - `hypergrowth_initial_margin`: starting operating margin during hypergrowth (can be meaningfully negative).
  - `hypergrowth_terminal_margin`: margin hypergrowth companies converge to by the end of the window; treated as their long-run “normal” margin once public.
  - `initial_ps_multiple`: private-phase revenue multiple used to translate revenue into pre-gate valuations.
  - `post_gate_initial_ps_multiple`: revenue multiple around IPO / exit from hypergrowth (still elevated).
  - `post_gate_terminal_ps_multiple`: steady-state revenue multiple hypergrowth ventures converge to as normal public companies.
  - `post_gate_multiple_decay_years`: years over which the multiple slides from `post_gate_initial_ps_multiple` to `post_gate_terminal_ps_multiple`.
  - `pmf_loss_prob_per_year`: annual chance a native hypergrowth company enters a product–market-fit loss phase.
  - `pmf_decline_rate_range`: range of annual revenue/margin shock applied while PMF loss is active (e.g., −40% to −25% per year).
  - `pmf_decline_duration_years`: duration (in years) that a PMF loss event remains active before the company stabilises at a new, lower trajectory.
